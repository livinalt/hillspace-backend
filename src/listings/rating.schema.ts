import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type RatingDocument = HydratedDocument<Rating>;

@Schema({ timestamps: true })
export class Rating {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Listing', required: true, index: true })
  listing: Types.ObjectId;

  /** Star rating from 1 to 5 (inclusive). */
  @Prop({ required: true, min: 1, max: 5 })
  stars: number;

  @Prop({ trim: true })
  comment?: string;
}

export const RatingSchema = SchemaFactory.createForClass(Rating);
RatingSchema.index({ user: 1, listing: 1 }, { unique: true });
