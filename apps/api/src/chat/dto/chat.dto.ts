import { Type } from "class-transformer";
import { CHAT_REACTION_EMOJIS } from "@nodo/shared";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from "class-validator";

export const CHAT_KINDS = ["TEXT", "IMAGE", "FILE", "ORDER", "PRODUCT", "SYSTEM"] as const;

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body?: string;

  @IsOptional()
  @IsIn(["TEXT", "IMAGE", "FILE", "ORDER", "PRODUCT"])
  kind?: "TEXT" | "IMAGE" | "FILE" | "ORDER" | "PRODUCT";

  @IsOptional()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  replyToId?: string;
}

export class OpenChatDto {
  @IsUUID()
  linkId!: string;

  /** La otra persona. Si no viene, se usa el vendedor asignado o el dueño del otro lado. */
  @IsOptional()
  @IsUUID()
  peerUserId?: string;
}

export class ChatPeersQueryDto {
  @IsUUID()
  linkId!: string;
}

export class EditChatMessageDto {
  @IsString()
  @MaxLength(8000)
  body!: string;
}

export class PinChatMessageDto {
  @IsUUID()
  messageId!: string;
}

export class ChatSearchQueryDto {
  @IsString()
  @MaxLength(120)
  q!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  take?: number;
}

export class ChatMessagesQueryDto {
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  take?: number;
}

export class ShareOrderDto {
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  threadId?: string;
}

export class ReactChatMessageDto {
  @IsIn([...CHAT_REACTION_EMOJIS])
  emoji!: (typeof CHAT_REACTION_EMOJIS)[number];
}
