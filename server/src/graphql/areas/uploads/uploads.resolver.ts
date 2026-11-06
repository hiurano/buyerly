import { Arg, Ctx, Mutation, Resolver } from 'type-graphql';
import { MAX_UPLOAD_BYTES } from '../../../uploads/images.ts';
import { SIGNED_UPLOAD_PATH, UPLOAD_PURPOSES, signUpload, type UploadPurpose } from '../../../uploads/signed.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { UploadPayload, type Payload } from '../../payloads.ts';
import { limitField } from '../../rate-limit.ts';
import { JSONScalar } from '../../scalars.ts';

// Uploading a file (api/routers/onboarding.py request_file_upload), as
// Linear's fileUpload: a signed link the browser PUTs the bytes to
// (routes/uploads.ts), then the avatar or logo takes the file it answers
// with through userUpdate or workspaceUpdate.

interface FileUploadRequest {
  purpose: UploadPurpose;
  content_type: string;
  filename: string;
  size: number;
}

const FILE_UPLOAD = inputSchema<FileUploadRequest>({
  type: 'object',
  additionalProperties: false,
  required: ['purpose', 'content_type', 'filename', 'size'],
  properties: {
    purpose: { type: 'string', enum: UPLOAD_PURPOSES },
    content_type: { type: 'string', maxLength: 100 },
    filename: { type: 'string', minLength: 1, maxLength: 255 },
    size: { type: 'integer', minimum: 1 },
  },
});

@Resolver()
export class UploadsResolver {
  @Mutation(() => UploadPayload, { nullable: true, description: 'A signed link to PUT a file to: an avatar or a workspace logo.' })
  async fileUpload(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    limitField(context, 'file_upload', 20);
    const req = FILE_UPLOAD.parse(input);
    if (req.size > MAX_UPLOAD_BYTES) throw new RouteError(400, 'The file must not exceed 5 MB');
    const token = signUpload(context.app.config.otpPepper, {
      u: context.user.id,
      p: req.purpose,
      n: req.filename,
      t: req.content_type,
    });
    return mutated(context, UploadPayload, {
      upload_url: `${SIGNED_UPLOAD_PATH}?token=${token}`,
      headers: { 'Content-Type': req.content_type || 'application/octet-stream' },
    });
  }
}
