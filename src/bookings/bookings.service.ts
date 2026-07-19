import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { ListingsService } from '../listings/listings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import {
  Booking,
  BookingDocument,
  BookingPaymentStatus,
  BookingStatus,
} from './booking.schema';

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    private readonly listingsService: ListingsService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async create(buyerId: string, dto: CreateBookingDto): Promise<BookingDocument> {
    const listing = await this.listingsService.findById(dto.listingId);
    const ownerId = this.refId(listing.owner);
    if (ownerId === buyerId) {
      throw new BadRequestException('Cannot book inspection on your own listing');
    }

    const agentId = this.refId(listing.agent ?? listing.owner);
    const fee = dto.fee ?? listing.inspectionFee ?? 0;
    const booking = await this.bookingModel.create({
      listing: listing._id,
      buyer: new Types.ObjectId(buyerId),
      agent: new Types.ObjectId(agentId),
      date: new Date(dto.date),
      time: dto.time,
      inspectionType: dto.inspectionType,
      note: dto.note,
      fee,
      status: BookingStatus.PENDING,
      paymentStatus: BookingPaymentStatus.UNPAID,
    });

    if (this.notificationsService) {
      try {
        await this.notificationsService.create({
          userId: agentId,
          title: 'New inspection booking',
          body: `Someone booked an inspection for ${listing.title}`,
          type: 'booking_created',
          data: { bookingId: booking.id, listingId: listing.id },
        });
      } catch {
        // Booking should succeed even if notification delivery fails
      }
    }

    return booking;
  }

  async myBookings(userId: string) {
    const user = new Types.ObjectId(userId);
    return this.bookingModel
      .find({
        $or: [{ buyer: user }, { agent: user }],
      })
      .sort({ date: -1 })
      .populate('listing', 'title price location images currency')
      .populate('buyer', 'firstName lastName email phone avatarUrl')
      .populate('agent', 'firstName lastName email phone avatarUrl');
  }

  async findById(id: string, userId: string, role: Role): Promise<BookingDocument> {
    const booking = await this.bookingModel
      .findById(id)
      .populate('listing', 'title price location images')
      .populate('buyer', 'firstName lastName email phone')
      .populate('agent', 'firstName lastName email phone');
    if (!booking) throw new NotFoundException('Booking not found');

    const isParty =
      booking.buyer.toString() === userId ||
      booking.agent?.toString() === userId ||
      (booking.listing as any)?.owner?.toString?.() === userId;
    if (role !== Role.ADMIN && !isParty) {
      // re-check raw ids if populate changed shape
      const raw = await this.bookingModel.findById(id);
      if (
        !raw ||
        (raw.buyer.toString() !== userId && raw.agent?.toString() !== userId)
      ) {
        throw new ForbiddenException('Not a party to this booking');
      }
    }
    return booking;
  }

  async confirm(id: string, userId: string, role: Role) {
    const booking = await this.getOwnedBooking(id, userId, role, 'agent');
    booking.status = BookingStatus.CONFIRMED;
    booking.paymentStatus = BookingPaymentStatus.MARKED_PAID;
    await booking.save();

    if (this.notificationsService) {
      await this.notificationsService.create({
        userId: this.refId(booking.buyer),
        title: 'Inspection confirmed',
        body: 'Your property inspection has been confirmed.',
        type: 'booking_confirmed',
        data: { bookingId: booking.id },
      });
    }
    return booking;
  }

  async cancel(id: string, userId: string, role: Role) {
    const booking = await this.getOwnedBooking(id, userId, role, 'any');
    if (
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.CANCELLED
    ) {
      throw new BadRequestException(`Cannot cancel a ${booking.status} booking`);
    }
    booking.status = BookingStatus.CANCELLED;
    return booking.save();
  }

  private refId(ref: Types.ObjectId | { _id?: Types.ObjectId } | string | null | undefined): string {
    if (!ref) return '';
    if (typeof ref === 'string') return ref;
    if (typeof ref === 'object' && '_id' in ref && ref._id) {
      return ref._id.toString();
    }
    return ref.toString();
  }

  private async getOwnedBooking(
    id: string,
    userId: string,
    role: Role,
    who: 'agent' | 'any',
  ): Promise<BookingDocument> {
    const booking = await this.bookingModel.findById(id);
    if (!booking) throw new NotFoundException('Booking not found');
    if (role === Role.ADMIN) return booking;

    if (who === 'agent') {
      if (booking.agent?.toString() !== userId) {
        throw new ForbiddenException('Only the agent/owner can confirm');
      }
    } else {
      const isParty =
        booking.buyer.toString() === userId ||
        booking.agent?.toString() === userId;
      if (!isParty) throw new ForbiddenException('Not a party to this booking');
    }
    return booking;
  }
}
