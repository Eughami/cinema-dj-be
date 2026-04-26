"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const multer_1 = __importDefault(require("multer"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const adminUsername = ((_a = process.env.ADMIN_USERNAME) === null || _a === void 0 ? void 0 : _a.trim()) || '';
const adminPassword = ((_b = process.env.ADMIN_PASSWORD) === null || _b === void 0 ? void 0 : _b.trim()) || '';
const adminJwtSecret = ((_c = process.env.ADMIN_JWT_SECRET) === null || _c === void 0 ? void 0 : _c.trim()) || '';
const parsedAdminJwtTtl = Number(process.env.ADMIN_JWT_EXPIRES_IN_SECONDS);
const adminJwtTtlSeconds = Number.isFinite(parsedAdminJwtTtl) && parsedAdminJwtTtl > 0
    ? Math.floor(parsedAdminJwtTtl)
    : 60 * 60 * 8;
const adminAuthIsConfigured = adminUsername.length > 0 && adminPassword.length > 0 && adminJwtSecret.length > 0;
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, './uploads');
    },
    filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const uploadMovieImages = (0, multer_1.default)({
    storage,
    limits: { fileSize: 1024 * 1024 * 5 },
    fileFilter: (_req, file, cb) => {
        const isAllowedType = file.mimetype === 'image/jpeg' ||
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
app.use(express_1.default.json());
app.use((0, morgan_1.default)('combined'));
app.use((0, cors_1.default)({
    origin: clientOrigin,
    credentials: true,
}));
const headerCheckMiddleware = (_req, _res, next) => {
    next();
};
app.use(headerCheckMiddleware);
app.use('/uploads', express_1.default.static('uploads'));
const optionalText = zod_1.z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), zod_1.z.string().optional());
const optionalUrl = zod_1.z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), zod_1.z.string().url({ message: 'Invalid URL' }).optional());
const MoviePayloadSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, { message: 'Title is required' }),
    description: zod_1.z.string().min(1, { message: 'Description is required' }),
    duration: zod_1.z.coerce
        .number()
        .int({ message: 'Duration must be an integer' })
        .positive({ message: 'Duration must be greater than 0' }),
    genre: optionalText,
    actors: optionalText,
    release_date: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format. Use YYYY-MM-DD' }),
    transfer_link: optionalUrl,
    image: zod_1.z.string().min(1, { message: 'Image path is required' }),
    wide_image: zod_1.z.string().nullable().optional(),
});
const SessionSchema = zod_1.z.object({
    movie_id: zod_1.z.coerce.number().int().min(1, { message: 'Movie ID is required' }),
    audio: zod_1.z.string().min(1, { message: 'Audio is required' }),
    subtitle: optionalText,
    hall_no: zod_1.z.coerce.number().int().min(1, { message: 'Hall number is required' }),
    date: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format. Use YYYY-MM-DD' }),
    time: zod_1.z
        .string()
        .regex(/^\d{2}:\d{2}$/, { message: 'Invalid time format. Use HH:MM' }),
});
const BookingSchema = zod_1.z.object({
    session_id: zod_1.z.number().min(1, { message: 'Session ID is required' }),
    name: zod_1.z.string().min(1, { message: 'Name is required' }),
    email: zod_1.z.string().email({ message: 'Invalid email address' }),
    phone_number: zod_1.z.string().length(8, { message: 'Invalid phone number' }),
    seats: zod_1.z
        .array(zod_1.z.string().min(1, { message: 'Seat is required' }))
        .min(1, { message: 'At least one seat must be selected' }),
});
const BookingIdSchema = zod_1.z.object({
    bookingId: zod_1.z
        .string()
        .regex(/^\d+$/, { message: 'Booking ID must be a number' })
        .transform(Number),
});
const AdminLoginSchema = zod_1.z.object({
    username: zod_1.z.string().min(1, { message: 'Username is required' }),
    password: zod_1.z.string().min(1, { message: 'Password is required' }),
});
const AdminJwtPayloadSchema = zod_1.z.object({
    sub: zod_1.z.literal('admin'),
    username: zod_1.z.string().min(1),
    iat: zod_1.z.number().int().nonnegative(),
    exp: zod_1.z.number().int().positive(),
});
function openDb() {
    return __awaiter(this, void 0, void 0, function* () {
        return (0, sqlite_1.open)({
            filename: './database.db',
            driver: sqlite3_1.default.Database,
        });
    });
}
function initializeDb() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield openDb();
        yield db.exec(`
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
    });
}
void initializeDb().catch((error) => {
    console.error('Database initialization failed:', error);
});
function getUploadedFiles(req) {
    if (!req.files) {
        return {};
    }
    if (Array.isArray(req.files)) {
        return {};
    }
    return req.files;
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return 'Unknown error';
}
function handleDbError(res, error, errorMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        console.error('Database error:', error);
        res.status(500).json({ error: errorMessage, details: getErrorMessage(error) });
    });
}
function parsePositiveId(value) {
    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        return 0;
    }
    return parsedValue;
}
function toBase64Url(value) {
    return Buffer.from(value, 'utf8').toString('base64url');
}
function fromBase64Url(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}
function timingSafeStringEqual(left, right) {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return (0, crypto_1.timingSafeEqual)(leftBuffer, rightBuffer);
}
function signJwt(unsignedToken) {
    return (0, crypto_1.createHmac)('sha256', adminJwtSecret).update(unsignedToken).digest('base64url');
}
function createAdminJwt() {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
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
function verifyAdminJwt(token) {
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
        return null;
    }
    const [headerSegment, payloadSegment, signatureSegment] = tokenParts;
    if (!headerSegment || !payloadSegment || !signatureSegment) {
        return null;
    }
    try {
        const parsedHeader = JSON.parse(fromBase64Url(headerSegment));
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
    }
    catch (_a) {
        return null;
    }
}
app.post('/admin/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!adminAuthIsConfigured) {
            res.status(503).json({
                error: 'Admin API is disabled. Set ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_JWT_SECRET on the server.',
            });
            return;
        }
        const credentials = AdminLoginSchema.parse(req.body);
        const usernameMatches = timingSafeStringEqual(credentials.username.trim(), adminUsername);
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
            return;
        }
        console.error('Failed to process admin login:', error);
        res.status(500).json({ error: 'Failed to process admin login' });
    }
}));
const adminAuthMiddleware = (req, res, next) => {
    if (req.method === 'OPTIONS') {
        next();
        return;
    }
    if (!adminAuthIsConfigured) {
        res.status(503).json({
            error: 'Admin API is disabled. Set ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_JWT_SECRET on the server.',
        });
        return;
    }
    const authHeader = req.headers.authorization;
    const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
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
function checkForDuplicateBooking(db, sessionId, phoneNumber, ipAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        const existingByPhone = yield db.get(`SELECT b.id FROM bookings b
     JOIN booking_seats bs ON b.id = bs.booking_id
     WHERE b.session_id = ? AND b.phone_number = ?`, [sessionId, phoneNumber]);
        if (existingByPhone) {
            return { isDuplicate: true, reason: 'phone' };
        }
        if (ipAddress && ipAddress !== 'unknown') {
            const existingByIp = yield db.get(`SELECT b.id FROM bookings b
       JOIN booking_seats bs ON b.id = bs.booking_id
       WHERE b.session_id = ? AND b.ip_address = ?`, [sessionId, ipAddress]);
            if (existingByIp) {
                return { isDuplicate: true, reason: 'ip' };
            }
        }
        return { isDuplicate: false };
    });
}
function getClientIp(req) {
    var _a;
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    const via = req.headers['via'];
    if (typeof via === 'string') {
        const lastEntry = ((_a = via.split(',').pop()) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        const ipMatch = lastEntry.match(/\d+\.\d+\.\d+\.\d+/);
        if (ipMatch) {
            return ipMatch[0];
        }
    }
    return req.socket.remoteAddress || 'unknown';
}
app.get('/movies', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const movies = yield db.all('SELECT * FROM movies');
        res.json(movies);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch movies');
    }
}));
app.get('/movies/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const movieId = parsePositiveId(req.params.id);
        if (!movieId) {
            res.status(400).json({ error: 'Invalid movie ID' });
            return;
        }
        const movie = yield db.get('SELECT * FROM movies WHERE id = ?', [movieId]);
        if (!movie) {
            res.status(404).json({ error: 'Movie not found' });
            return;
        }
        res.json(movie);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch movie');
    }
}));
app.get('/sessions', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const sessions = yield db.all('SELECT * FROM sessions');
        res.json(sessions);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch sessions');
    }
}));
app.get('/sessions/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const sessionId = parsePositiveId(req.params.id);
        if (!sessionId) {
            res.status(400).json({ error: 'Invalid session ID' });
            return;
        }
        const session = yield db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json(session);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch session');
    }
}));
app.get('/movies/:id/sessions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const movieId = parsePositiveId(req.params.id);
        if (!movieId) {
            res.status(400).json({ error: 'Invalid movie ID' });
            return;
        }
        const sessions = yield db.all('SELECT * FROM sessions WHERE movie_id = ?', [movieId]);
        res.json(sessions);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch sessions');
    }
}));
app.get('/sessions/:id/seats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const sessionId = parsePositiveId(req.params.id);
        if (!sessionId) {
            res.status(400).json({ error: 'Invalid session ID' });
            return;
        }
        const seats = yield db.all('SELECT seat FROM booking_seats WHERE session_id = ?', [sessionId]);
        const sessionDetails = yield db.get('SELECT * FROM sessions WHERE id = ?', [
            sessionId,
        ]);
        if (!sessionDetails) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const movieDetails = yield db.get('SELECT * FROM movies WHERE id = ?', [
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
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch data');
    }
}));
app.get('/admin/sessions/:id/details', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sessionId = parsePositiveId(req.params.id);
        if (!sessionId) {
            res.status(400).json({ error: 'Invalid session ID' });
            return;
        }
        const db = yield openDb();
        const session = yield db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const movie = yield db.get('SELECT * FROM movies WHERE id = ?', [session.movie_id]);
        if (!movie) {
            res.status(404).json({ error: 'Movie not found for this session' });
            return;
        }
        const reservations = yield db.all('SELECT id, name, email, phone_number FROM bookings WHERE session_id = ? ORDER BY id DESC', [sessionId]);
        const reservationsWithSeats = yield Promise.all(reservations.map((reservation) => __awaiter(void 0, void 0, void 0, function* () {
            const seats = yield db.all('SELECT seat FROM booking_seats WHERE booking_id = ? ORDER BY seat ASC', [reservation.id]);
            const reservedSeats = seats.map((seatRow) => seatRow.seat);
            return Object.assign(Object.assign({}, reservation), { seats: reservedSeats, people_count: reservedSeats.length });
        })));
        const totalPeople = reservationsWithSeats.reduce((accumulator, reservation) => accumulator + reservation.people_count, 0);
        res.json({
            session,
            movie,
            reservations: reservationsWithSeats,
            total_reservations: reservationsWithSeats.length,
            total_people: totalPeople,
        });
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch session details');
    }
}));
app.post('/book', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let db = null;
    let transactionActive = false;
    try {
        db = yield openDb();
        const booking = BookingSchema.parse(req.body);
        const clientIp = getClientIp(req);
        const duplicateResult = yield checkForDuplicateBooking(db, booking.session_id, booking.phone_number, clientIp);
        if (duplicateResult.isDuplicate) {
            res.status(409).json({
                error: 'Vous avez déjà fait une réservation pour cette session',
                reason: duplicateResult.reason,
            });
            return;
        }
        yield db.run('BEGIN TRANSACTION');
        transactionActive = true;
        const createdBooking = yield db.run('INSERT INTO bookings (session_id, name, email, phone_number, ip_address) VALUES (?, ?, ?, ?, ?)', [booking.session_id, booking.name, booking.email, booking.phone_number, clientIp]);
        const bookingId = createdBooking.lastID;
        for (const seat of booking.seats) {
            yield db.run('INSERT INTO booking_seats (booking_id, session_id, seat) VALUES (?, ?, ?)', [bookingId, booking.session_id, seat]);
        }
        yield db.run('COMMIT');
        transactionActive = false;
        const bookedDetails = yield db.get('SELECT id, session_id, name, email, phone_number FROM bookings WHERE id = ?', [
            bookingId,
        ]);
        const bookedSeats = yield db.all('SELECT seat FROM booking_seats WHERE booking_id = ?', [bookingId]);
        res.json({
            success: true,
            bookingSummary: {
                booking_id: bookedDetails === null || bookedDetails === void 0 ? void 0 : bookedDetails.id,
                name: bookedDetails === null || bookedDetails === void 0 ? void 0 : bookedDetails.name,
                email: bookedDetails === null || bookedDetails === void 0 ? void 0 : bookedDetails.email,
                phone_number: bookedDetails === null || bookedDetails === void 0 ? void 0 : bookedDetails.phone_number,
                session_id: bookedDetails === null || bookedDetails === void 0 ? void 0 : bookedDetails.session_id,
                seats: bookedSeats.map((seatRow) => seatRow.seat),
            },
        });
    }
    catch (error) {
        if (transactionActive && db) {
            yield db.run('ROLLBACK');
        }
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
            return;
        }
        yield handleDbError(res, error, 'Failed to book seats');
    }
}));
app.get('/verify-booking/:bookingId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { bookingId } = BookingIdSchema.parse(req.params);
        const db = yield openDb();
        const bookingDetails = yield db.get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        if (!bookingDetails) {
            res.status(404).json({ error: 'Booking not found' });
            return;
        }
        const sessionDetails = yield db.get('SELECT * FROM sessions WHERE id = ?', [
            bookingDetails.session_id,
        ]);
        if (!sessionDetails) {
            res.status(404).json({ error: 'Session not found for this booking' });
            return;
        }
        const movieDetails = yield db.get('SELECT * FROM movies WHERE id = ?', [
            sessionDetails.movie_id,
        ]);
        if (!movieDetails) {
            res.status(404).json({ error: 'Movie not found for this session' });
            return;
        }
        const bookedSeats = yield db.all('SELECT seat FROM booking_seats WHERE booking_id = ?', [bookingId]);
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
            return;
        }
        yield handleDbError(res, error, 'Failed to verify booking');
    }
}));
app.post('/admin/movies', uploadMovieImages, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const files = getUploadedFiles(req);
        const imageFile = (_a = files.image) === null || _a === void 0 ? void 0 : _a[0];
        if (!imageFile) {
            res.status(400).json({ error: 'Image file is required' });
            return;
        }
        const movieData = MoviePayloadSchema.parse(Object.assign(Object.assign({}, req.body), { image: imageFile.path, wide_image: (_d = (_c = (_b = files.wide_image) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.path) !== null && _d !== void 0 ? _d : null }));
        const db = yield openDb();
        const createdMovie = yield db.run('INSERT INTO movies (title, description, duration, genre, actors, release_date, transfer_link, image, wide_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            movieData.title,
            movieData.description,
            movieData.duration,
            movieData.genre,
            movieData.actors,
            movieData.release_date,
            movieData.transfer_link,
            movieData.image,
            movieData.wide_image,
        ]);
        res.json({ id: createdMovie.lastID });
    }
    catch (error) {
        if (error instanceof multer_1.default.MulterError) {
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
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
            return;
        }
        yield handleDbError(res, error, 'Failed to add movie');
    }
}));
app.put('/admin/movies/:id', uploadMovieImages, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const movieId = parsePositiveId(req.params.id);
        if (!movieId) {
            res.status(400).json({ error: 'Invalid movie ID' });
            return;
        }
        const db = yield openDb();
        const existingMovie = yield db.get('SELECT id, image, wide_image FROM movies WHERE id = ?', [movieId]);
        if (!existingMovie) {
            res.status(404).json({ error: 'Movie not found' });
            return;
        }
        const files = getUploadedFiles(req);
        const movieData = MoviePayloadSchema.parse(Object.assign(Object.assign({}, req.body), { image: (_c = (_b = (_a = files.image) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.path) !== null && _c !== void 0 ? _c : existingMovie.image, wide_image: (_f = (_e = (_d = files.wide_image) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.path) !== null && _f !== void 0 ? _f : existingMovie.wide_image }));
        const updatedMovie = yield db.run('UPDATE movies SET title = ?, description = ?, duration = ?, genre = ?, actors = ?, release_date = ?, transfer_link = ?, image = ?, wide_image = ? WHERE id = ?', [
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
        ]);
        if (!updatedMovie.changes) {
            res.status(404).json({ error: 'Movie not found' });
            return;
        }
        res.json({ id: movieId });
    }
    catch (error) {
        if (error instanceof multer_1.default.MulterError) {
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
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
            return;
        }
        yield handleDbError(res, error, 'Failed to update movie');
    }
}));
app.delete('/admin/movies/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let db = null;
    let transactionActive = false;
    try {
        const movieId = parsePositiveId(req.params.id);
        if (!movieId) {
            res.status(400).json({ error: 'Invalid movie ID' });
            return;
        }
        db = yield openDb();
        const movie = yield db.get('SELECT id FROM movies WHERE id = ?', [movieId]);
        if (!movie) {
            res.status(404).json({ error: 'Movie not found' });
            return;
        }
        yield db.run('BEGIN TRANSACTION');
        transactionActive = true;
        yield db.run('DELETE FROM booking_seats WHERE session_id IN (SELECT id FROM sessions WHERE movie_id = ?)', [movieId]);
        yield db.run('DELETE FROM bookings WHERE session_id IN (SELECT id FROM sessions WHERE movie_id = ?)', [movieId]);
        yield db.run('DELETE FROM sessions WHERE movie_id = ?', [movieId]);
        yield db.run('DELETE FROM movies WHERE id = ?', [movieId]);
        yield db.run('COMMIT');
        transactionActive = false;
        res.json({ id: movieId, success: true });
    }
    catch (error) {
        if (transactionActive && db) {
            yield db.run('ROLLBACK');
        }
        yield handleDbError(res, error, 'Failed to delete movie');
    }
}));
app.post('/admin/sessions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const session = SessionSchema.parse(req.body);
        const db = yield openDb();
        const createdSession = yield db.run('INSERT INTO sessions (movie_id, audio, subtitle, hall_no, date, time) VALUES (?, ?, ?, ?, ?, ?)', [
            session.movie_id,
            session.audio,
            session.subtitle,
            session.hall_no,
            session.date,
            session.time,
        ]);
        res.json({ id: createdSession.lastID });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
            return;
        }
        yield handleDbError(res, error, 'Failed to add session');
    }
}));
app.put('/admin/sessions/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sessionId = parsePositiveId(req.params.id);
        if (!sessionId) {
            res.status(400).json({ error: 'Invalid session ID' });
            return;
        }
        const session = SessionSchema.parse(req.body);
        const db = yield openDb();
        const updatedSession = yield db.run('UPDATE sessions SET movie_id = ?, audio = ?, subtitle = ?, hall_no = ?, date = ?, time = ? WHERE id = ?', [
            session.movie_id,
            session.audio,
            session.subtitle,
            session.hall_no,
            session.date,
            session.time,
            sessionId,
        ]);
        if (!updatedSession.changes) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json({ id: sessionId });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
            return;
        }
        yield handleDbError(res, error, 'Failed to update session');
    }
}));
app.delete('/admin/sessions/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let db = null;
    let transactionActive = false;
    try {
        const sessionId = parsePositiveId(req.params.id);
        if (!sessionId) {
            res.status(400).json({ error: 'Invalid session ID' });
            return;
        }
        db = yield openDb();
        const session = yield db.get('SELECT id FROM sessions WHERE id = ?', [sessionId]);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        yield db.run('BEGIN TRANSACTION');
        transactionActive = true;
        yield db.run('DELETE FROM booking_seats WHERE session_id = ?', [sessionId]);
        yield db.run('DELETE FROM bookings WHERE session_id = ?', [sessionId]);
        yield db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
        yield db.run('COMMIT');
        transactionActive = false;
        res.json({ id: sessionId, success: true });
    }
    catch (error) {
        if (transactionActive && db) {
            yield db.run('ROLLBACK');
        }
        yield handleDbError(res, error, 'Failed to delete session');
    }
}));
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
