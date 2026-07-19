import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Role } from '../common/enums/role.enum';
import {
  ListingSortBy,
  ListingStatus,
} from '../common/enums/listing-status.enum';
import { VerificationStatus } from '../common/enums/verification-status.enum';
import { CreateListingDto } from './dto/create-listing.dto';
import { RateListingDto } from './dto/rate-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { Favorite } from './favorite.schema';
import { Listing, ListingDocument } from './listing.schema';
import { Rating } from './rating.schema';

function rangeFilter(
  min?: number,
  max?: number,
): Record<string, number> | undefined {
  if (min === undefined && max === undefined) return undefined;
  const range: Record<string, number> = {};
  if (min !== undefined) range.$gte = min;
  if (max !== undefined) range.$lte = max;
  return range;
}

/** Approximate bounding box for radiusKm around lat/lng (degrees). */
function geoBoundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  const lngDelta =
    radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return {
    'location.lat': { $gte: lat - latDelta, $lte: lat + latDelta },
    'location.lng': { $gte: lng - lngDelta, $lte: lng + lngDelta },
  };
}

function sortForSearch(
  q: string | undefined,
  sortBy?: ListingSortBy,
): Record<string, 1 | -1 | { $meta: string }> {
  if (q) {
    return { score: { $meta: 'textScore' } };
  }
  switch (sortBy) {
    case ListingSortBy.PRICE_ASC:
      return { price: 1 };
    case ListingSortBy.PRICE_DESC:
      return { price: -1 };
    case ListingSortBy.RATING:
      return { ratingAvg: -1, ratingCount: -1 };
    case ListingSortBy.NEWEST:
    default:
      return { createdAt: -1 };
  }
}

function roundRating(avg: number): number {
  return Math.round(avg * 10) / 10;
}

@Injectable()
export class ListingsService {
  constructor(
    @InjectModel(Listing.name) private readonly listingModel: Model<Listing>,
    @InjectModel(Favorite.name) private readonly favoriteModel: Model<Favorite>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<Rating>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    ownerId: string,
    role: Role,
    dto: CreateListingDto,
    files: Express.Multer.File[] = [],
  ): Promise<ListingDocument> {
    const uploadedImages = await this.uploadListingImages(files);

    const payload: Partial<Listing> = {
      ...dto,
      images: uploadedImages,
      owner: new Types.ObjectId(ownerId),
      status: dto.status ?? ListingStatus.DRAFT,
      verificationStatus: VerificationStatus.UNVERIFIED,
    };

    if (role === Role.AGENT) {
      payload.agent = new Types.ObjectId(ownerId);
    }

    return this.listingModel.create(payload);
  }

  async findById(id: string): Promise<ListingDocument> {
    const listing = await this.listingModel
      .findById(id)
      .populate('owner', 'firstName lastName email phone kycStatus avatarUrl')
      .populate('agent', 'firstName lastName email phone agentStatus avatarUrl');

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  async myListings(ownerId: string, status?: ListingStatus) {
    const owner = new Types.ObjectId(ownerId);
    const filter: Record<string, unknown> = {
      $or: [{ owner }, { agent: owner }],
    };
    if (status) filter.status = status;
    return this.listingModel.find(filter).sort({ updatedAt: -1 });
  }

  async update(
    id: string,
    userId: string,
    role: Role,
    dto: UpdateListingDto,
    files: Express.Multer.File[] = [],
  ): Promise<ListingDocument> {
    const listing = await this.findOwned(id, userId, role);
    Object.assign(listing, dto);

    if (files.length) {
      const uploadedImages = await this.uploadListingImages(files);
      listing.images.push(...uploadedImages);
    }

    return listing.save();
  }

  async remove(id: string, userId: string, role: Role): Promise<{ message: string }> {
    const listing = await this.findOwned(id, userId, role);

    const cloudinaryIds = [
      ...listing.images.map((image) => image.publicId),
      ...listing.ownershipDocs.map((doc) => doc.publicId),
    ].filter(Boolean);

    await Promise.all(
      cloudinaryIds.map((publicId) =>
        this.cloudinaryService.deleteAsset(publicId).catch(() => undefined),
      ),
    );

    await listing.deleteOne();
    return { message: 'Listing deleted' };
  }

  async uploadImages(
    id: string,
    userId: string,
    role: Role,
    files: Express.Multer.File[],
  ): Promise<ListingDocument> {
    const listing = await this.findOwned(id, userId, role);
    listing.images.push(...(await this.uploadListingImages(files)));
    return listing.save();
  }

  private async uploadListingImages(files: Express.Multer.File[]) {
    if (!files.length) return [];

    const uploads = await Promise.all(
      files.map((file) => this.cloudinaryService.uploadImage(file, 'listings')),
    );

    return uploads.map((upload) => ({
      url: upload.secure_url,
      publicId: upload.public_id,
    }));
  }

  async uploadOwnershipDocs(
    id: string,
    userId: string,
    role: Role,
    files: Express.Multer.File[],
    labels?: string[],
  ): Promise<ListingDocument> {
    const listing = await this.findOwned(id, userId, role);
    const uploads = await Promise.all(
      files.map((file) =>
        this.cloudinaryService.uploadImage(file, 'listings/ownership'),
      ),
    );
    listing.ownershipDocs.push(
      ...uploads.map((upload, i) => ({
        url: upload.secure_url,
        publicId: upload.public_id,
        label: labels?.[i] || files[i].originalname,
      })),
    );
    return listing.save();
  }

  async publish(id: string, userId: string, role: Role): Promise<ListingDocument> {
    const listing = await this.findOwned(id, userId, role);
    listing.status = ListingStatus.ACTIVE;
    return listing.save();
  }

  async addFavorite(userId: string, listingId: string) {
    await this.findById(listingId);
    const user = new Types.ObjectId(userId);
    const listing = new Types.ObjectId(listingId);
    try {
      return await this.favoriteModel.create({ user, listing });
    } catch {
      throw new ConflictException('Listing already favorited');
    }
  }

  async removeFavorite(userId: string, listingId: string) {
    const result = await this.favoriteModel.findOneAndDelete({
      user: new Types.ObjectId(userId),
      listing: new Types.ObjectId(listingId),
    });
    if (!result) {
      throw new NotFoundException('Favorite not found');
    }
    return { message: 'Removed from favorites' };
  }

  async myFavorites(userId: string) {
    return this.favoriteModel
      .find({ user: new Types.ObjectId(userId) })
      .populate({
        path: 'listing',
        populate: [
          { path: 'owner', select: 'firstName lastName' },
          { path: 'agent', select: 'firstName lastName' },
        ],
      })
      .sort({ createdAt: -1 });
  }

  async rateListing(userId: string, listingId: string, dto: RateListingDto) {
    const listing = await this.listingModel.findById(listingId).select('owner agent');
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.owner.toString() === userId) {
      throw new BadRequestException('You cannot rate your own listing');
    }
    if (listing.agent?.toString() === userId) {
      throw new BadRequestException('You cannot rate your own listing');
    }

    const user = new Types.ObjectId(userId);
    const listingRef = new Types.ObjectId(listingId);

    const rating = await this.ratingModel.findOneAndUpdate(
      { user, listing: listingRef },
      {
        $set: {
          stars: dto.stars,
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
        },
        $setOnInsert: {
          user,
          listing: listingRef,
        },
      },
      { upsert: true, new: true, runValidators: true },
    );

    const listingStats = await this.recalculateListingRating(listingId);
    return { rating, listing: listingStats };
  }

  async getMyRating(userId: string, listingId: string) {
    await this.findById(listingId);
    const rating = await this.ratingModel.findOne({
      user: new Types.ObjectId(userId),
      listing: new Types.ObjectId(listingId),
    });
    if (!rating) {
      throw new NotFoundException('You have not rated this listing');
    }
    return rating;
  }

  async listRatings(listingId: string) {
    await this.findById(listingId);
    return this.ratingModel
      .find({ listing: new Types.ObjectId(listingId) })
      .populate('user', 'firstName lastName avatarUrl')
      .sort({ updatedAt: -1 });
  }

  async deleteMyRating(userId: string, listingId: string) {
    const result = await this.ratingModel.findOneAndDelete({
      user: new Types.ObjectId(userId),
      listing: new Types.ObjectId(listingId),
    });
    if (!result) {
      throw new NotFoundException('Rating not found');
    }
    const listingStats = await this.recalculateListingRating(listingId);
    return { message: 'Rating removed', listing: listingStats };
  }

  private async recalculateListingRating(listingId: string) {
    const [stats] = await this.ratingModel.aggregate<{
      avg: number;
      count: number;
    }>([
      { $match: { listing: new Types.ObjectId(listingId) } },
      {
        $group: {
          _id: null,
          avg: { $avg: '$stars' },
          count: { $sum: 1 },
        },
      },
    ]);

    const ratingAvg = stats ? roundRating(stats.avg) : 0;
    const ratingCount = stats?.count ?? 0;

    const listing = await this.listingModel.findByIdAndUpdate(
      listingId,
      { ratingAvg, ratingCount },
      { new: true },
    );
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    return {
      _id: listing._id,
      ratingAvg: listing.ratingAvg,
      ratingCount: listing.ratingCount,
    };
  }

  async search(query: SearchListingsDto) {
    const {
      q,
      propertyType,
      purpose,
      category,
      spaceKind,
      paymentFrequency,
      city,
      state,
      lga,
      minPrice,
      maxPrice,
      bedrooms,
      bathrooms,
      minAreaSqm,
      maxAreaSqm,
      minAreaSqft,
      maxAreaSqft,
      minYearBuilt,
      maxYearBuilt,
      parking,
      amenities,
      utilities,
      lat,
      lng,
      radiusKm,
      status,
      verificationStatus,
      sortBy,
      page = 1,
      limit = 20,
    } = query;

    const filter: Record<string, unknown> = {};

    if (q) {
      filter.$text = { $search: q };
    }
    if (propertyType) filter.propertyType = propertyType;
    if (purpose) filter.purpose = purpose;
    if (category) filter.category = category;
    if (spaceKind) filter.spaceKind = spaceKind;
    if (paymentFrequency) filter.paymentFrequency = paymentFrequency;
    if (city) filter['location.city'] = new RegExp(city, 'i');
    if (state) filter['location.state'] = new RegExp(state, 'i');
    if (lga) filter['location.lga'] = new RegExp(lga, 'i');
    if (bedrooms !== undefined) filter.bedrooms = { $gte: bedrooms };
    if (bathrooms !== undefined) filter.bathrooms = { $gte: bathrooms };
    if (parking) filter.parking = new RegExp(parking, 'i');
    if (amenities?.length) filter.amenities = { $all: amenities };
    if (utilities?.length) filter.utilities = { $all: utilities };

    const price = rangeFilter(minPrice, maxPrice);
    if (price) filter.price = price;
    const areaSqm = rangeFilter(minAreaSqm, maxAreaSqm);
    if (areaSqm) filter.areaSqm = areaSqm;
    const areaSqft = rangeFilter(minAreaSqft, maxAreaSqft);
    if (areaSqft) filter.areaSqft = areaSqft;
    const yearBuilt = rangeFilter(minYearBuilt, maxYearBuilt);
    if (yearBuilt) filter.yearBuilt = yearBuilt;

    if (lat !== undefined && lng !== undefined && radiusKm !== undefined) {
      Object.assign(filter, geoBoundingBox(lat, lng, radiusKm));
    }

    if (status) {
      filter.status = status;
    } else {
      filter.status = ListingStatus.ACTIVE;
    }
    if (verificationStatus) {
      filter.verificationStatus = verificationStatus;
    }

    const skip = (page - 1) * limit;
    const sort = sortForSearch(q, sortBy);
    const [items, total] = await Promise.all([
      this.listingModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('owner', 'firstName lastName kycStatus avatarUrl')
        .populate('agent', 'firstName lastName agentStatus avatarUrl'),
      this.listingModel.countDocuments(filter),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async setVerificationStatus(
    id: string,
    status: VerificationStatus,
  ): Promise<ListingDocument> {
    const listing = await this.listingModel.findByIdAndUpdate(
      id,
      { verificationStatus: status },
      { new: true },
    );
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  async setStatus(id: string, status: ListingStatus): Promise<ListingDocument> {
    const listing = await this.listingModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  private async findOwned(
    id: string,
    userId: string,
    role: Role,
  ): Promise<ListingDocument> {
    const listing = await this.listingModel.findById(id);
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const isOwner = listing.owner.toString() === userId;
    const isAgent = listing.agent?.toString() === userId;
    if (role !== Role.ADMIN && !isOwner && !isAgent) {
      throw new ForbiddenException('You cannot modify this listing');
    }

    return listing;
  }
}
