import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { ImageUploadResponse, LogoUploadResponse } from '@buyerly/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { currentUser } from '../auth/plugin.ts';
import { rateLimit } from '../http/rate-limit.ts';
import { UserEntity } from '../entities/index.ts';
import { HttpError, ValidationFailed } from '../http/errors.ts';
import { ImageStorage, InvalidImageUpload, MAX_UPLOAD_BYTES } from '../uploads/images.ts';
import { SIGNED_UPLOAD_PATH, verifyUpload } from '../uploads/signed.ts';

// Image uploads (api/routers/onboarding.py: avatar and workspace logo) and
// the files themselves under /uploads/ (api/server.py mounts them), on the
// same paths, limits and answers. Attaching a logo to a workspace is a
// workspace update and moves with Workspaces.

// The Python API's cap on an upload request (api/server.py): 6 MB, for a
// 5 MB image and the form around it.
export const UPLOAD_REQUEST_LIMIT = 6 * 1024 * 1024;
const TOO_LARGE = 'The request body exceeds the allowed size limit.';

interface UploadedFile {
  content: Buffer;
  filename: string;
  contentType: string | null;
}

function missingFile(): ValidationFailed {
  return new ValidationFailed([{ type: 'missing', loc: ['body', 'file'], msg: 'Field required', input: null }]);
}

// The form's "file" part, as FastAPI's `file: UploadFile = File(...)` reads
// it: the last part of that name wins; other parts are ignored. At most
// MAX_UPLOAD_BYTES + 1 bytes are kept, as `file.read(MAX_UPLOAD_BYTES + 1)`.
async function formFile(request: FastifyRequest): Promise<UploadedFile> {
  if (!request.isMultipart()) throw missingFile();
  let found: UploadedFile | null = null;
  let text: string | null = null;
  for await (const part of request.parts({ limits: { fileSize: MAX_UPLOAD_BYTES + 1 } })) {
    if (part.fieldname !== 'file') {
      if (part.type === 'file') part.file.resume();
      continue;
    }
    if (part.type === 'file') {
      // busboy says text/plain for a part without a type; Starlette says
      // nothing, which the image check accepts.
      const declared = part.mimetype === 'text/plain' ? null : part.mimetype;
      found = { content: await part.toBuffer(), filename: part.filename, contentType: declared };
      text = null;
    } else {
      found = null;
      text = String(part.value);
    }
  }
  if (found) return found;
  if (text !== null) {
    throw new ValidationFailed([{
      type: 'value_error',
      loc: ['body', 'file'],
      msg: "Value error, Expected UploadFile, received: <class 'str'>",
      input: text,
      ctx: { error: {} },
    }]);
  }
  throw missingFile();
}

async function stored<T>(save: () => Promise<T>): Promise<T> {
  try {
    return await save();
  } catch (error) {
    if (error instanceof InvalidImageUpload) throw new HttpError(400, error.message);
    throw error;
  }
}

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  const images = new ImageStorage(app.config.uploadsRoot);
  await mkdir(join(images.root, 'avatars'), { recursive: true });
  await mkdir(join(images.root, 'workspaces'), { recursive: true });

  // Past the limit the part is cut, not refused: the image check answers.
  await app.register(fastifyMultipart, { throwFileSizeLimit: false });

  // Uploads get a new name on every change, so browsers may keep them.
  // Anything but a file (a directory, a dotfile, a path out of the
  // directory) is "Not Found", as Starlette's StaticFiles answers.
  await app.register(async (files) => {
    files.setErrorHandler(async (error: { statusCode?: number }, request, reply) => {
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        reply.code(404);
        return { detail: 'Not Found' };
      }
      request.log.error({ err: error }, 'Request failed');
      reply.code(500);
      return { detail: 'Internal Server Error' };
    });
    await files.register(fastifyStatic, {
      root: images.root,
      prefix: '/uploads/',
      decorateReply: false,
      index: false,
      list: false,
      redirect: false,
      // Half-written files (".upload-…") are never served.
      dotfiles: 'deny',
      cacheControl: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      immutable: true,
    });
  });

  // Refused before the body is read, as the Python API's middleware does.
  const upload = {
    bodyLimit: UPLOAD_REQUEST_LIMIT,
    onRequest: async (request: FastifyRequest) => {
      const length = Number(request.headers['content-length']);
      if (Number.isFinite(length) && length > UPLOAD_REQUEST_LIMIT) throw new HttpError(413, TOO_LARGE);
    },
    preValidation: [currentUser],
  };

  // The bytes of a file `fileUpload` granted (graphql/areas/uploads), PUT to
  // its signed link (decision 55). The link is the grant: no session is
  // needed. The answer is where the file is now; the avatar or logo takes it
  // with the next userUpdate or workspace update, which check it is the
  // user's own. Logos nobody took for a day are removed first.
  await app.register(async (signed) => {
    signed.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: UPLOAD_REQUEST_LIMIT }, (_request, body, done) => done(null, body));
    signed.put<{ Querystring: { token?: string } }>(
      SIGNED_UPLOAD_PATH,
      {
        bodyLimit: UPLOAD_REQUEST_LIMIT,
        onRequest: upload.onRequest,
        preValidation: [rateLimit({ limit: 20, scope: 'signed_upload' })],
      },
      async (request): Promise<{ asset_url: string }> => {
        const grant = verifyUpload(app.config.otpPepper, String(request.query.token ?? ''));
        if (!grant) throw new HttpError(403, 'This upload link is invalid or has expired');
        const content = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        const category = grant.p === 'avatar' ? 'avatars' : 'workspaces';
        if (category === 'workspaces') await app.db.transaction((tx) => images.cleanupStaleWorkspaceLogos(tx));
        const assetUrl = await stored(() =>
          images.save(content, { filename: grant.n, contentType: grant.t || null, category, ownerUserId: grant.u }),
        );
        return { asset_url: assetUrl };
      },
    );
  });

  // A new avatar for the member; the old one, if uploaded here, is removed.
  app.post('/api/onboarding/avatar', upload, async (request): Promise<ImageUploadResponse> => {
    const { user } = request.auth!;
    const file = await formFile(request);
    const avatarUrl = await stored(() =>
      images.save(file.content, {
        filename: file.filename || 'avatar.png',
        contentType: file.contentType,
        category: 'avatars',
        ownerUserId: user.id,
      }),
    );
    const ownPrefix = `avatar_${user.id}_`;
    let oldAvatar: string;
    try {
      oldAvatar = await app.db.transaction(async (tx) => {
        const row = await tx.findOneByOrFail(UserEntity, { id: user.id });
        await tx.update(UserEntity, { id: user.id }, { avatarUrl });
        return row.avatarUrl;
      });
    } catch (error) {
      await images.delete(avatarUrl, 'avatars', ownPrefix);
      throw error;
    }
    await images.delete(oldAvatar, 'avatars', ownPrefix);
    return { status: 'ok', avatar_url: avatarUrl };
  });

  // Back to the initial badge.
  app.delete('/api/onboarding/avatar', { preValidation: [currentUser] }, async (request): Promise<ImageUploadResponse> => {
    const { user } = request.auth!;
    const oldAvatar = await app.db.transaction(async (tx) => {
      const row = await tx.findOneByOrFail(UserEntity, { id: user.id });
      await tx.update(UserEntity, { id: user.id }, { avatarUrl: '' });
      return row.avatarUrl;
    });
    await images.delete(oldAvatar, 'avatars', `avatar_${user.id}_`);
    return { status: 'ok', avatar_url: '' };
  });

  // A logo for a workspace being made or edited; the workspace takes it with
  // its next update. Logos nobody took for a day are removed first.
  app.post('/api/onboarding/workspace/logo', upload, async (request): Promise<LogoUploadResponse> => {
    const { user } = request.auth!;
    const file = await formFile(request);
    await app.db.transaction((tx) => images.cleanupStaleWorkspaceLogos(tx));
    const logoUrl = await stored(() =>
      images.save(file.content, {
        filename: file.filename || 'logo.png',
        contentType: file.contentType,
        category: 'workspaces',
        ownerUserId: user.id,
      }),
    );
    return { status: 'ok', logo_url: logoUrl };
  });
}
