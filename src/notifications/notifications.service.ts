import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification } from './notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  async create(input: {
    userId: string;
    title: string;
    body: string;
    type: string;
    data?: Record<string, unknown>;
  }) {
    return this.notificationModel.create({
      user: new Types.ObjectId(input.userId),
      title: input.title,
      body: input.body,
      type: input.type,
      data: input.data,
      read: false,
    });
  }

  async list(userId: string) {
    const user = new Types.ObjectId(userId);
    return this.notificationModel
      .find({ user })
      .sort({ createdAt: -1 })
      .limit(100);
  }

  async markRead(userId: string, id: string) {
    const n = await this.notificationModel.findOneAndUpdate(
      { _id: id, user: new Types.ObjectId(userId) },
      { read: true },
      { new: true },
    );
    if (!n) throw new NotFoundException('Notification not found');
    return n;
  }

  async markAllRead(userId: string) {
    await this.notificationModel.updateMany(
      { user: new Types.ObjectId(userId), read: false },
      { read: true },
    );
    return { message: 'All notifications marked as read' };
  }
}
