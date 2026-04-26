import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import dotenv from 'dotenv'
dotenv.config();

type SqliteDb = Database<sqlite3.Database, sqlite3.Statement>;
type UploadedFiles = Record<string, Express.Multer.File[]>;

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const adminUsername = process.env.ADMIN_USERNAME?.trim() || '';
const adminPassword = process.env.ADMIN_PASSWORD?.trim() || '';
const adminJwtSecret = process.env.ADMIN_JWT_SECRET?.trim() || '';
const parsedAdminJwtTtl = Number(process.env.ADMIN_JWT_EXPIRES_IN_SECONDS);
const adminJwtTtlSeconds =
  Number.isFinite(parsedAdminJwtTtl) && parsedAdminJwtTtl > 0
    ? Math.floor(parsedAdminJwtTtl)
    : 60 * 60 * 8;
const adminAuthIsConfigured =
  adminUsername.length > 0 && adminPassword.length > 0 && adminJwtSecret.length > 0;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, './uploads');
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const uploadMovieImages = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 5 },
  fileFilter: (_req, file, cb) => {
    const isAllowedType =
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/webp';

    if (isAllowedType) {
      cb(null, true);
      return;
    }

    cb(new Error('Only JPEG, PNG, and WEBP images are allowed!'));
  },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'wide_image', maxCount: 1 },
]);

app.use(express.json());
app.use(morgan('combined'));
app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);

const headerCheckMiddleware = (
  _req: Request,
  _res: Response,
  next: NextFunction
): void => {
  next();
};

app.use(headerCheckMiddleware);
app.use('/uploads', express.static('uploads'));

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional()
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url({ message: 'Invalid URL' }).optional()
);

const MoviePayloadSchema = z.object({
  title: z.string().min(1, { message: 'Title is required' }),
  description: z.string().min(1, { message: 'Description is required' }),
  duration: z.coerce
    .number()
    .int({ message: 'Duration must be an integer' })
    .positive({ message: 'Duration must be greater than 0' }),
  genre: optionalText,
  actors: optionalText,
  release_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format. Use YYYY-MM-DD' }),
  transfer_link: optionalUrl,
  image: z.string().min(1, { message: 'Image path is required' }),
  wide_image: z.string().nullable().optional(),
});

const SessionSchema = z.object({
  movie_id: z.coerce.number().int().min(1, { message: 'Movie ID is required' }),
  audio: z.string().min(1, { message: 'Audio is required' }),
  subtitle: optionalText,
  hall_no: z.coerce.number().int().min(1, { message: 'Hall number is required' }),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format. Use YYYY-MM-DD' }),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { message: 'Invalid time format. Use HH:MM' }),
});

const BookingSchema = z.object({
  session_id: z.number().min(1, { message: 'Session ID is required' }),
  name: z.string().min(1, { message: 'Name is required' }),
  email: z.string().email({ message: 'Invalid email address' }),
  phone_number: z.string().length(8, { message: 'Invalid phone number' }),
  seats: z
    .array(z.string().min(1, { message: 'Seat is required' }))
    .min(1, { message: 'At least one seat must be selected' }),
});

const BookingIdSchema = z.object({
  bookingId: z
    .string()
    .regex(/^\d+$/, { message: 'Booking ID must be a number' })
    .transform(Number),
});

const AdminLoginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

const AdminJwtPayloadSchema = z.object({
  sub: z.literal('admin'),
  username: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

type AdminJwtPayload = z.infer<typeof AdminJwtPayloadSchema>;

async function openDb(): Promise<SqliteDb> {
  return open({
    filename: './database.db',
    driver: sqlite3.Database,
  });
}

async function initializeDb(): Promise<void> {
  const db = await openDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      duration INTEGER NOT NULL,
      genre TEXT,
      actors TEXT,
      release_date TEXT NOT NULL,
      transfer_link TEXT,
      image TEXT NOT NULL,
      wide_image TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL,
      audio TEXT NOT NULL,
      subtitle TEXT,
      hall_no INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      UNIQUE(hall_no, date, time),
      FOREIGN KEY (movie_id) REFERENCES movies(id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS booking_seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      seat TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id, seat)
    );
  `);

  console.log('Database initialized');
}

void initializeDb().catch((error: unknown) => {
  console.error('Database initialization failed:', error);
});

function getUploadedFiles(req: Request): UploadedFiles {
  if (!req.files) {
    return {};
  }

  if (Array.isArray(req.files)) {
    return {};
  }

  return req.files as UploadedFiles;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

async function handleDbError(
  res: Response,
  error: unknown,
  errorMessage: string
): Promise<void> {
  console.error('Database error:', error);
  res.status(500).json({ error: errorMessage, details: getErrorMessage(error) });
}

function parsePositiveId(value: string): number {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return 0;
  }

  return parsedValue;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signJwt(unsignedToken: string): string {
  return createHmac('sha256', adminJwtSecret).update(unsignedToken).digest('base64url');
}

function createAdminJwt(): { token: string; expiresInSeconds: number } {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: AdminJwtPayload = {
    sub: 'admin',
    username: adminUsername,
    iat: issuedAt,
    exp: issuedAt + adminJwtTtlSeconds,
  };

  const headerSegment = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${headerSegment}.${payloadSegment}`;
  const signature = signJwt(unsignedToken);

  return {
    token: `${unsignedToken}.${signature}`,
    expiresInSeconds: adminJwtTtlSeconds,
  };
}

function verifyAdminJwt(token: string): AdminJwtPayload | null {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    return null;
  }

  const [headerSegment, payloadSegment, signatureSegment] = tokenParts;
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    return null;
  }

  try {
    const parsedHeader = JSON.parse(fromBase64Url(headerSegment)) as {
      alg?: string;
      typ?: string;
    };

    if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') {
      return null;
    }

    const unsignedToken = `${headerSegment}.${payloadSegment}`;
    const expectedSignature = signJwt(unsignedToken);

    if (!timingSafeStringEqual(signatureSegment, expectedSignature)) {
      return null;
    }

    const parsedPayload = JSON.parse(fromBase64Url(payloadSegment));
    const payloadResult = AdminJwtPayloadSchema.safeParse(parsedPayload);
    if (!payloadResult.success) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payloadResult.data.exp <= now) {
      return null;
    }

    return payloadResult.data;
  } catch {
    return null;
  }
}

app.post('/admin/login', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!adminAuthIsConfigured) {
      res.status(503).json({
        error:
          'Admin API is disabled. Set ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_JWT_SECRET on the server.',
      });
      return;
    }

    const credentials = AdminLoginSchema.parse(req.body);
    const usernameMatches = timingSafeStringEqual(
      credentials.username.trim(),
      adminUsername
    );
    const passwordMatches = timingSafeStringEqual(credentials.password, adminPassword);

    if (!usernameMatches || !passwordMatches) {
      res.status(401).json({ error: 'Invalid admin credentials' });
      return;
    }

    const jwtResult = createAdminJwt();

    res.json({
      token: jwtResult.token,
      token_type: 'Bearer',
      expires_in: jwtResult.expiresInSeconds,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }

    console.error('Failed to process admin login:', error);
    res.status(500).json({ error: 'Failed to process admin login' });
  }
});

const adminAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  if (!adminAuthIsConfigured) {
    res.status(503).json({
      error:
        'Admin API is disabled. Set ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_JWT_SECRET on the server.',
    });
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

  if (!bearerToken) {
    res.status(401).json({ error: 'Missing admin bearer token' });
    return;
  }

  const payload = verifyAdminJwt(bearerToken);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired admin token' });
    return;
  }

  next();
};

app.use('/admin', adminAuthMiddleware);

interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: 'phone' | 'ip';
}

async function checkForDuplicateBooking(
  db: SqliteDb,
  sessionId: number,
  phoneNumber: string,
  ipAddress?: string
): Promise<DuplicateCheckResult> {
  const existingByPhone = await db.get<{ id: number }>(
    `SELECT b.id FROM bookings b
     JOIN booking_seats bs ON b.id = bs.booking_id
     WHERE b.session_id = ? AND b.phone_number = ?`,
    [sessionId, phoneNumber]
  );

  if (existingByPhone) {
    return { isDuplicate: true, reason: 'phone' };
  }

  if (ipAddress && ipAddress !== 'unknown') {
    const existingByIp = await db.get<{ id: number }>(
      `SELECT b.id FROM bookings b
       JOIN booking_seats bs ON b.id = bs.booking_id
       WHERE b.session_id = ? AND b.ip_address = ?`,
      [sessionId, ipAddress]
    );

    if (existingByIp) {
      return { isDuplicate: true, reason: 'ip' };
    }
  }

  return { isDuplicate: false };
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }

  const via = req.headers['via'];
  if (typeof via === 'string') {
    const lastEntry = via.split(',').pop()?.trim() || '';
    const ipMatch = lastEntry.match(/\d+\.\d+\.\d+\.\d+/);
    if (ipMatch) {
      return ipMatch[0];
    }
  }

  return req.socket.remoteAddress || 'unknown';
}

app.get('/movies', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await openDb();
    const movies = await db.all('SELECT * FROM movies');
    res.json(movies);
  } catch (error: unknown) {
    await handleDbError(res, error, 'Failed to fetch movies');
  }
});

app.get('/movies/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await openDb();
    const movieId = parsePositiveId(req.params.id);

    if (!movieId) {
      res.status(400).json({ error: 'Invalid movie ID' });
      return;
    }

    const movie = await db.get('SELECT * FROM movies WHERE id = ?', [movieId]);

    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    res.json(movie);
  } catch (error: unknown) {
    await handleDbError(res, error, 'Failed to fetch movie');
  }
});

app.get('/sessions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await openDb();
    const sessions = await db.all('SELECT * FROM sessions');
    res.json(sessions);
  } catch (error: unknown) {
    await handleDbError(res, error, 'Failed to fetch sessions');
  }
});

app.get('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await openDb();
    const sessionId = parsePositiveId(req.params.id);

    if (!sessionId) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json(session);
  } catch (error: unknown) {
    await handleDbError(res, error, 'Failed to fetch session');
  }
});

app.get('/movies/:id/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await openDb();
    const movieId = parsePositiveId(req.params.id);

    if (!movieId) {
      res.status(400).json({ error: 'Invalid movie ID' });
      return;
    }

    const sessions = await db.all('SELECT * FROM sessions WHERE movie_id = ?', [movieId]);
    res.json(sessions);
  } catch (error: unknown) {
    await handleDbError(res, error, 'Failed to fetch sessions');
  }
});

app.get('/sessions/:id/seats', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await openDb();
    const sessionId = parsePositiveId(req.params.id);

    if (!sessionId) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    const seats = await db.all<{ seat: string }[]>(
      'SELECT seat FROM booking_seats WHERE session_id = ?',
      [sessionId]
    );

    const sessionDetails = await db.get('SELECT * FROM sessions WHERE id = ?', [
      sessionId,
    ]);

    if (!sessionDetails) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const movieDetails = await db.get('SELECT * FROM movies WHERE id = ?', [
      sessionDetails.movie_id,
    ]);

    if (!movieDetails) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    res.json({
      seats: seats.map((seatRow) => seatRow.seat),
      sessionDetails,
      movieDetails,
    });
  } catch (error: unknown) {
    await handleDbError(res, error, 'Failed to fetch data');
  }
});

app.get(
  '/admin/sessions/:id/details',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = parsePositiveId(req.params.id);
      if (!sessionId) {
        res.status(400).json({ error: 'Invalid session ID' });
        return;
      }

      const db = await openDb();
      const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const movie = await db.get('SELECT * FROM movies WHERE id = ?', [session.movie_id]);

      if (!movie) {
        res.status(404).json({ error: 'Movie not found for this session' });
        return;
      }

      const reservations = await db.all<
        { id: number; name: string; email: string; phone_number: string }[]
      >(
        'SELECT id, name, email, phone_number FROM bookings WHERE session_id = ? ORDER BY id DESC',
        [sessionId]
      );

      const reservationsWithSeats = await Promise.all(
        reservations.map(async (reservation) => {
          const seats = await db.all<{ seat: string }[]>(
            'SELECT seat FROM booking_seats WHERE booking_id = ? ORDER BY seat ASC',
            [reservation.id]
          );

          const reservedSeats = seats.map((seatRow) => seatRow.seat);
          return {
            ...reservation,
            seats: reservedSeats,
            people_count: reservedSeats.length,
          };
        })
      );

      const totalPeople = reservationsWithSeats.reduce(
        (accumulator, reservation) => accumulator + reservation.people_count,
        0
      );

      res.json({
        session,
        movie,
        reservations: reservationsWithSeats,
        total_reservations: reservationsWithSeats.length,
        total_people: totalPeople,
      });
    } catch (error: unknown) {
      await handleDbError(res, error, 'Failed to fetch session details');
    }
  }
);

app.post('/book', async (req: Request, res: Response): Promise<void> => {
  let db: SqliteDb | null = null;
  let transactionActive = false;

  try {
    db = await openDb();

    const booking = BookingSchema.parse(req.body);
    const clientIp = getClientIp(req);

    const duplicateResult = await checkForDuplicateBooking(
      db,
      booking.session_id,
      booking.phone_number,
      clientIp
    );

    if (duplicateResult.isDuplicate) {
      res.status(409).json({
        error: 'Vous avez déjà fait une réservation pour cette session',
        reason: duplicateResult.reason,
      });
      return;
    }

    await db.run('BEGIN TRANSACTION');
    transactionActive = true;

    const createdBooking = await db.run(
      'INSERT INTO bookings (session_id, name, email, phone_number, ip_address) VALUES (?, ?, ?, ?, ?)',
      [booking.session_id, booking.name, booking.email, booking.phone_number, clientIp]
    );

    const bookingId = createdBooking.lastID;

    for (const seat of booking.seats) {
      await db.run(
        'INSERT INTO booking_seats (booking_id, session_id, seat) VALUES (?, ?, ?)',
        [bookingId, booking.session_id, seat]
      );
    }

    await db.run('COMMIT');
    transactionActive = false;

    const bookedDetails = await db.get<{
      id: number;
      session_id: number;
      name: string;
      email: string;
      phone_number: string;
    }>('SELECT id, session_id, name, email, phone_number FROM bookings WHERE id = ?', [
      bookingId,
    ]);

    const bookedSeats = await db.all<{ seat: string }[]>(
      'SELECT seat FROM booking_seats WHERE booking_id = ?',
      [bookingId]
    );

    res.json({
      success: true,
      bookingSummary: {
        booking_id: bookedDetails?.id,
        name: bookedDetails?.name,
        email: bookedDetails?.email,
        phone_number: bookedDetails?.phone_number,
        session_id: bookedDetails?.session_id,
        seats: bookedSeats.map((seatRow) => seatRow.seat),
      },
    });
  } catch (error: unknown) {
    if (transactionActive && db) {
      await db.run('ROLLBACK');
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }

    await handleDbError(res, error, 'Failed to book seats');
  }
});

app.get(
  '/verify-booking/:bookingId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { bookingId } = BookingIdSchema.parse(req.params);
      const db = await openDb();

      const bookingDetails = await db.get(
        'SELECT * FROM bookings WHERE id = ?',
        [bookingId]
      );

      if (!bookingDetails) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }

      const sessionDetails = await db.get('SELECT * FROM sessions WHERE id = ?', [
        bookingDetails.session_id,
      ]);

      if (!sessionDetails) {
        res.status(404).json({ error: 'Session not found for this booking' });
        return;
      }

      const movieDetails = await db.get('SELECT * FROM movies WHERE id = ?', [
        sessionDetails.movie_id,
      ]);

      if (!movieDetails) {
        res.status(404).json({ error: 'Movie not found for this session' });
        return;
      }

      const bookedSeats = await db.all<{ seat: string }[]>(
        'SELECT seat FROM booking_seats WHERE booking_id = ?',
        [bookingId]
      );

      res.json({
        status: 'valid',
        booking: {
          id: bookingDetails.id,
          name: bookingDetails.name,
          email: bookingDetails.email,
          phone_number: bookingDetails.phone_number,
          seats: bookedSeats.map((seatRow) => seatRow.seat),
          session: sessionDetails,
          movie: movieDetails,
        },
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: error.issues });
        return;
      }

      await handleDbError(res, error, 'Failed to verify booking');
    }
  }
);

app.post('/admin/movies', uploadMovieImages, async (req: Request, res: Response): Promise<void> => {
  try {
    const files = getUploadedFiles(req);
    const imageFile = files.image?.[0];

    if (!imageFile) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const movieData = MoviePayloadSchema.parse({
      ...req.body,
      image: imageFile.path,
      wide_image: files.wide_image?.[0]?.path ?? null,
    });

    const db = await openDb();
    const createdMovie = await db.run(
      'INSERT INTO movies (title, description, duration, genre, actors, release_date, transfer_link, image, wide_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        movieData.title,
        movieData.description,
        movieData.duration,
        movieData.genre,
        movieData.actors,
        movieData.release_date,
        movieData.transfer_link,
        movieData.image,
        movieData.wide_image,
      ]
    );

    res.json({ id: createdMovie.lastID });
  } catch (error: unknown) {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File size exceeds limit (5MB)' });
        return;
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ error: 'Unexpected file type' });
        return;
      }

      res.status(400).json({ error: `Multer Error: ${error.message}` });
      return;
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }

    await handleDbError(res, error, 'Failed to add movie');
  }
});

app.put('/admin/movies/:id', uploadMovieImages, async (req: Request, res: Response): Promise<void> => {
  try {
    const movieId = parsePositiveId(req.params.id);
    if (!movieId) {
      res.status(400).json({ error: 'Invalid movie ID' });
      return;
    }

    const db = await openDb();
    const existingMovie = await db.get<{
      id: number;
      image: string;
      wide_image: string | null;
    }>('SELECT id, image, wide_image FROM movies WHERE id = ?', [movieId]);

    if (!existingMovie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    const files = getUploadedFiles(req);

    const movieData = MoviePayloadSchema.parse({
      ...req.body,
      image: files.image?.[0]?.path ?? existingMovie.image,
      wide_image: files.wide_image?.[0]?.path ?? existingMovie.wide_image,
    });

    const updatedMovie = await db.run(
      'UPDATE movies SET title = ?, description = ?, duration = ?, genre = ?, actors = ?, release_date = ?, transfer_link = ?, image = ?, wide_image = ? WHERE id = ?',
      [
        movieData.title,
        movieData.description,
        movieData.duration,
        movieData.genre,
        movieData.actors,
        movieData.release_date,
        movieData.transfer_link,
        movieData.image,
        movieData.wide_image,
        movieId,
      ]
    );

    if (!updatedMovie.changes) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    res.json({ id: movieId });
  } catch (error: unknown) {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File size exceeds limit (5MB)' });
        return;
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ error: 'Unexpected file type' });
        return;
      }

      res.status(400).json({ error: `Multer Error: ${error.message}` });
      return;
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }

    await handleDbError(res, error, 'Failed to update movie');
  }
});

app.delete('/admin/movies/:id', async (req: Request, res: Response): Promise<void> => {
  let db: SqliteDb | null = null;
  let transactionActive = false;

  try {
    const movieId = parsePositiveId(req.params.id);
    if (!movieId) {
      res.status(400).json({ error: 'Invalid movie ID' });
      return;
    }

    db = await openDb();

    const movie = await db.get('SELECT id FROM movies WHERE id = ?', [movieId]);
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    await db.run('BEGIN TRANSACTION');
    transactionActive = true;

    await db.run(
      'DELETE FROM booking_seats WHERE session_id IN (SELECT id FROM sessions WHERE movie_id = ?)',
      [movieId]
    );
    await db.run(
      'DELETE FROM bookings WHERE session_id IN (SELECT id FROM sessions WHERE movie_id = ?)',
      [movieId]
    );
    await db.run('DELETE FROM sessions WHERE movie_id = ?', [movieId]);
    await db.run('DELETE FROM movies WHERE id = ?', [movieId]);

    await db.run('COMMIT');
    transactionActive = false;

    res.json({ id: movieId, success: true });
  } catch (error: unknown) {
    if (transactionActive && db) {
      await db.run('ROLLBACK');
    }

    await handleDbError(res, error, 'Failed to delete movie');
  }
});

app.post('/admin/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const session = SessionSchema.parse(req.body);
    const db = await openDb();

    const createdSession = await db.run(
      'INSERT INTO sessions (movie_id, audio, subtitle, hall_no, date, time) VALUES (?, ?, ?, ?, ?, ?)',
      [
        session.movie_id,
        session.audio,
        session.subtitle,
        session.hall_no,
        session.date,
        session.time,
      ]
    );

    res.json({ id: createdSession.lastID });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }

    await handleDbError(res, error, 'Failed to add session');
  }
});

app.put('/admin/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = parsePositiveId(req.params.id);
    if (!sessionId) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    const session = SessionSchema.parse(req.body);
    const db = await openDb();

    const updatedSession = await db.run(
      'UPDATE sessions SET movie_id = ?, audio = ?, subtitle = ?, hall_no = ?, date = ?, time = ? WHERE id = ?',
      [
        session.movie_id,
        session.audio,
        session.subtitle,
        session.hall_no,
        session.date,
        session.time,
        sessionId,
      ]
    );

    if (!updatedSession.changes) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({ id: sessionId });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }

    await handleDbError(res, error, 'Failed to update session');
  }
});

app.delete('/admin/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  let db: SqliteDb | null = null;
  let transactionActive = false;

  try {
    const sessionId = parsePositiveId(req.params.id);
    if (!sessionId) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    db = await openDb();

    const session = await db.get('SELECT id FROM sessions WHERE id = ?', [sessionId]);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await db.run('BEGIN TRANSACTION');
    transactionActive = true;

    await db.run('DELETE FROM booking_seats WHERE session_id = ?', [sessionId]);
    await db.run('DELETE FROM bookings WHERE session_id = ?', [sessionId]);
    await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);

    await db.run('COMMIT');
    transactionActive = false;

    res.json({ id: sessionId, success: true });
  } catch (error: unknown) {
    if (transactionActive && db) {
      await db.run('ROLLBACK');
    }

    await handleDbError(res, error, 'Failed to delete session');
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
