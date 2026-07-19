import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ListingStatus } from '../common/enums/listing-status.enum';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateListingDto } from './dto/create-listing.dto';
import { RateListingDto } from './dto/rate-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingsService } from './listings.service';

const listingImagesInterceptor = FileFieldsInterceptor(
  [{ name: 'images', maxCount: 10 }],
  {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  },
);

@ApiTags('Listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Search and filter listings (Home / Explore)',
    description: [
      'Public listing search used by Home chips, Explore categories, search bar, Nearby, and the filter modal.',
      '',
      '### Home — My Spaces chips',
      '- **All** → call this endpoint and **omit** `purpose` (there is no `purpose=all` value)',
      '- **Rent** → `purpose=rent`',
      '- **Buy** → `purpose=sale` (API uses `sale`, not `buy`)',
      '- **My Listings** → use `GET /listings/mine` instead (JWT + seller/agent/admin)',
      '',
      '### Explore — category chips',
      '- **2 Bedroom** → `category=2_bedroom`',
      '- **3 Bedroom** → `category=3_bedroom`',
      '- **Land** → `category=land`',
      '- **Self-Con** → `category=self_con`',
      '- Prefer `category` for chips; `bedrooms` is a **minimum** (`$gte`), not an exact match',
      '',
      '### Search bar & filter icon',
      '- Search text → `q`',
      '- Filter modal → combine `minPrice`/`maxPrice`, `bedrooms`, `bathrooms`, `propertyType`,',
      '  `amenities`, `utilities`, area/year ranges, `parking`, `paymentFrequency`, `spaceKind`, `sortBy`, etc.',
      '- **Nearby** → pass `lat`, `lng`, and `radiusKm` together',
      '',
      'Defaults to `status=active` when `status` is omitted. Response is paginated (`page`, `limit`).',
    ].join('\n'),
  })
  search(@Query() query: SearchListingsDto) {
    return this.listingsService.search(query);
  }

  @Get('mine')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.AGENT, Role.ADMIN)
  @ApiOperation({
    summary: 'My listings (Home — My Listings chip)',
    description: [
      'Returns listings owned by the authenticated seller/agent (or all for admin).',
      'This is the backend for the Home **My Listings** chip — not a `purpose` filter on `GET /listings`.',
      'Optional `status` query filters drafts vs published, etc.',
    ].join('\n'),
  })
  @ApiQuery({ name: 'status', required: false, enum: ListingStatus })
  mine(
    @CurrentUser('sub') userId: string,
    @Query('status') status?: ListingStatus,
  ) {
    return this.listingsService.myListings(userId, status);
  }

  @Get('favorites')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List my favorites (Favorite tab)',
    description: [
      'Twitter-bookmark style saved listings for the Favorite bottom-nav tab.',
      'Each item includes the populated `listing` (with `ratingAvg` / `ratingCount` for the star UI).',
      'Add with `POST /listings/:id/favorite`, remove with `DELETE /listings/:id/favorite`.',
    ].join('\n'),
  })
  favorites(@CurrentUser('sub') userId: string) {
    return this.listingsService.myFavorites(userId);
  }

  @Get(':id/ratings')
  @ApiOperation({
    summary: 'List ratings for a listing',
    description:
      'Public list of user star ratings (1–5). Listing cards use aggregate `ratingAvg` (0–5, one decimal) and `ratingCount`.',
  })
  listRatings(@Param('id') id: string) {
    return this.listingsService.listRatings(id);
  }

  @Get(':id/rating/me')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get my rating for a listing',
    description: 'Returns the authenticated user\'s rating if they have one.',
  })
  getMyRating(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.listingsService.getMyRating(userId, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get listing by id' })
  findOne(@Param('id') id: string) {
    return this.listingsService.findById(id);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.AGENT, Role.ADMIN)
  @ApiOperation({
    summary:
      'Create a listing with optional images (1–10 files; stored as an array)',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description:
      'Send JSON, or multipart/form-data with listing fields + images. Attach one or many files under the same field name "images" (max 10). For multipart, pass location/amenities/utilities as JSON strings.',
    schema: {
      type: 'object',
      required: ['title', 'description', 'propertyType', 'purpose', 'price', 'location'],
      properties: {
        title: { type: 'string', example: '4-bed duplex in Lekki' },
        description: {
          type: 'string',
          example: 'Spacious duplex with BQ and parking',
        },
        propertyType: { type: 'string', example: 'duplex' },
        purpose: { type: 'string', example: 'sale' },
        price: { type: 'number', example: 85000000 },
        currency: { type: 'string', example: 'NGN' },
        bedrooms: { type: 'number', example: 4 },
        bathrooms: { type: 'number', example: 5 },
        location: {
          type: 'string',
          example:
            '{"address":"12 Admiralty Way","city":"Lagos","state":"Lagos","country":"Nigeria"}',
        },
        amenities: {
          type: 'string',
          example: '["parking","security","generator"]',
        },
        utilities: {
          type: 'string',
          example: '["Water Supply","Electricity"]',
        },
        images: {
          type: 'array',
          maxItems: 10,
          minItems: 1,
          description: 'One or more listing photos (same form field name: images)',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(listingImagesInterceptor)
  create(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
    @Body() dto: CreateListingDto,
    @UploadedFiles()
    files?: {
      images?: Express.Multer.File[];
    },
  ) {
    return this.listingsService.create(
      userId,
      role,
      dto,
      files?.images ?? [],
    );
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.AGENT, Role.ADMIN)
  @ApiOperation({
    summary:
      'Update a listing; optional new images append to the existing images array (max 10 per request)',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description:
      'Partial listing fields. To add photos, use multipart and attach one or many files under "images".',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        price: { type: 'number' },
        images: {
          type: 'array',
          maxItems: 10,
          description: 'Additional listing photos (appended to existing images)',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(listingImagesInterceptor)
  update(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
    @Body() dto: UpdateListingDto,
    @UploadedFiles()
    files?: {
      images?: Express.Multer.File[];
    },
  ) {
    return this.listingsService.update(
      id,
      userId,
      role,
      dto,
      files?.images ?? [],
    );
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.AGENT, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a listing' })
  remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.listingsService.remove(id, userId, role);
  }

  @Post(':id/images')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.AGENT, Role.ADMIN)
  @ApiOperation({
    summary: 'Upload listing images (1–10 files; appended to images array)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          maxItems: 10,
          description: 'One or more image files under the field name "images"',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImages(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.listingsService.uploadImages(id, userId, role, files ?? []);
  }

  @Post(':id/ownership-docs')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.AGENT, Role.ADMIN)
  @ApiOperation({ summary: 'Upload ownership verification documents' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('documents', 8, {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadOwnershipDocs(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.listingsService.uploadOwnershipDocs(
      id,
      userId,
      role,
      files ?? [],
    );
  }

  @Post(':id/publish')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.AGENT, Role.ADMIN)
  @ApiOperation({ summary: 'Publish a listing (set status active)' })
  publish(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.listingsService.publish(id, userId, role);
  }

  @Post(':id/favorite')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Add listing to favorites',
    description:
      'Bookmark a listing (Favorite tab). Idempotent conflict if already saved — use DELETE to unfavorite.',
  })
  addFavorite(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.listingsService.addFavorite(userId, id);
  }

  @Delete(':id/favorite')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Remove listing from favorites',
    description: 'Remove a bookmark from the Favorite tab.',
  })
  removeFavorite(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.listingsService.removeFavorite(userId, id);
  }

  @Post(':id/rating')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Rate a listing (1–5 stars)',
    description: [
      'Create or update the authenticated user\'s star rating for a listing.',
      'Stars are integers **1–5**. Recalculates listing `ratingAvg` (one decimal, e.g. 4.5) and `ratingCount`.',
      'Owners/agents cannot rate their own listings. Upsert: POST again to change your stars.',
    ].join('\n'),
  })
  rateListing(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: RateListingDto,
  ) {
    return this.listingsService.rateListing(userId, id, dto);
  }

  @Delete(':id/rating')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Remove my rating',
    description:
      'Deletes the authenticated user\'s rating and recalculates listing `ratingAvg` / `ratingCount`.',
  })
  deleteMyRating(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.listingsService.deleteMyRating(userId, id);
  }
}
