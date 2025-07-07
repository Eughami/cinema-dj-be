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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const zod_1 = require("zod");
const morgan_1 = __importDefault(require("morgan"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
// Define a custom error type for better error handling
class ServerError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'ServerError';
    }
}
const app = (0, express_1.default)();
// Multer configuration for file uploads
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/jpeg' ||
            file.mimetype === 'image/png' ||
            file.mimetype === 'image/webp') {
            cb(null, true);
        }
        else {
            cb(new Error('Only JPEG, PNG, and WEBP images are allowed!'), false);
        }
    },
}).fields([{ name: 'image', maxCount: 1 }, { name: 'wide_image', maxCount: 1 }]);
app.use(express_1.default.json());
app.use((0, morgan_1.default)('combined'));
app.use((0, cors_1.default)({
    origin: 'http://localhost:5173',
    credentials: true,
}));
// Custom middleware to check for specific headers (currently inactive)
const headerCheckMiddleware = (req, res, next) => {
    // const requiredHeader = 'x-required-header';
    // if (!req.headers[requiredHeader]) {
    //   return res.status(400).json({ error: `Missing required header: ${requiredHeader}` });
    // }
    next();
};
app.use(headerCheckMiddleware);
// Open SQLite database
function openDb() {
    return __awaiter(this, void 0, void 0, function* () {
        return (0, sqlite_1.open)({
            filename: './database.db',
            driver: sqlite3_1.default.Database,
        });
    });
}
// Initialize database (create tables if they don't exist)
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
initializeDb();
// Zod schemas for input validation with improved type safety and error messages
const MovieSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, { message: 'Title is required' }),
    description: zod_1.z.string().min(1, { message: 'Description is required' }),
    duration: zod_1.z.string().regex(/^\d+$/, { message: 'Duration must be a number' }),
    genre: zod_1.z.string().optional(),
    actors: zod_1.z.string().optional(),
    release_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format. Use YYYY-MM-DD' }),
    transfer_link: zod_1.z.string().url({ message: 'Invalid URL' }).optional(),
    image: zod_1.z.string().min(1, { message: 'Image path is required' }), // Assuming you'll provide the path
    wide_image: zod_1.z.string().optional(), // Wide image is optional
});
const SessionSchema = zod_1.z.object({
    movie_id: zod_1.z.number().min(1, { message: 'Movie ID is required' }),
    audio: zod_1.z.string().min(1, { message: 'Audio is required' }),
    subtitle: zod_1.z.string().optional(),
    hall_no: zod_1.z.number().min(1, { message: 'Hall number is required' }),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format. Use YYYY-MM-DD' }),
    time: zod_1.z.string().regex(/^\d{2}:\d{2}$/, { message: 'Invalid time format. Use HH:MM' }),
});
const BookingSchema = zod_1.z.object({
    session_id: zod_1.z.number().min(1, { message: 'Session ID is required' }),
    name: zod_1.z.string().min(1, { message: 'Name is required' }),
    email: zod_1.z.string().email({ message: 'Invalid email address' }),
    phone_number: zod_1.z.string().length(8, { message: 'Invalid phone number' }),
    seats: zod_1.z.array(zod_1.z.string().min(1, { message: 'Seat is required' }))
        .min(1, { message: 'At least one seat must be selected' }),
});
const BookingIdSchema = zod_1.z.object({
    bookingId: zod_1.z.string().regex(/^\d+$/, { message: 'Booking ID must be a number' }).transform(Number),
});
// Helper function to handle database errors
function handleDbError(res, error, errorMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        console.error('Database error:', error);
        res.status(500).json({ error: errorMessage, details: error.message });
    });
}
// Endpoints with improved error handling and type safety
// Get all movies
app.get('/movies', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const movies = yield db.all('SELECT * FROM movies');
        res.json(movies);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch movies');
    }
}));
// Get a movie by ID
app.get('/movies/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const movie = yield db.get('SELECT * FROM movies WHERE id = ?', [
            req.params.id,
        ]);
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }
        res.json(movie);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch movie');
    }
}));
// Get all sessions
app.get('/sessions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const sessions = yield db.all('SELECT * FROM sessions');
        res.json(sessions);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch sessions');
    }
}));
// Get a session by ID
app.get('/sessions/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const session = yield db.get('SELECT * FROM sessions WHERE id = ?', [
            req.params.id,
        ]);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(session);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch session');
    }
}));
// Get session by movie
app.get('/movies/:id/sessions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const sessions = yield db.all('SELECT * FROM sessions WHERE movie_id = ?', req.params.id);
        res.json(sessions);
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch sessions');
    }
}));
// Get seats for a session
app.get('/sessions/:id/seats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const sessionId = req.params.id;
        const seats = yield db.all('SELECT seat FROM booking_seats WHERE session_id = ?', [sessionId]);
        const sessionDetails = yield db.get('SELECT * FROM sessions WHERE id = ?', [
            sessionId,
        ]);
        if (!sessionDetails) {
            return res.status(404).json({ error: 'Session not found' });
        }
        const movieDetails = yield db.get('SELECT * FROM movies WHERE id = ?', [
            sessionDetails.movie_id,
        ]);
        if (!movieDetails) {
            return res.status(404).json({ error: 'Movie not found' });
        }
        res.json({
            seats: seats.map((s) => s.seat),
            sessionDetails,
            movieDetails,
        });
    }
    catch (error) {
        yield handleDbError(res, error, 'Failed to fetch data');
    }
}));
// Book seats with improved error handling and return summary
app.post('/book', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const db = yield openDb();
    let transactionActive = false;
    try {
        const booking = BookingSchema.parse(req.body);
        yield db.run('BEGIN TRANSACTION');
        transactionActive = true;
        const { lastID: bookingId } = yield db.run('INSERT INTO bookings (session_id, name, email, phone_number) VALUES (?, ?, ?, ?)', [booking.session_id, booking.name, booking.email, booking.phone_number]);
        for (const seat of booking.seats) {
            yield db.run('INSERT INTO booking_seats (booking_id, session_id, seat) VALUES (?, ?, ?)', [bookingId, booking.session_id, seat]);
        }
        yield db.run('COMMIT');
        transactionActive = false;
        // Fetch the newly created booking details for the summary
        const bookedDetails = yield db.get('SELECT id, session_id, name, email, phone_number FROM bookings WHERE id = ?', [bookingId]);
        const bookedSeats = yield db.all('SELECT seat FROM booking_seats WHERE booking_id = ?', [bookingId]);
        res.json({
            success: true,
            bookingSummary: {
                booking_id: bookedDetails.id,
                name: bookedDetails.name,
                email: bookedDetails.email,
                phone_number: bookedDetails.phone_number,
                session_id: bookedDetails.session_id,
                seats: bookedSeats.map((s) => s.seat),
            },
        });
    }
    catch (error) {
        if (transactionActive) {
            yield db.run('ROLLBACK');
        }
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
        }
        else {
            yield handleDbError(res, error, 'Failed to book seats');
        }
    }
}));
// New endpoint to verify a booking
app.get('/verify-booking/:bookingId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { bookingId } = BookingIdSchema.parse(req.params);
        const db = yield openDb();
        const bookingDetails = yield db.get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        if (!bookingDetails) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        const sessionDetails = yield db.get('SELECT * FROM sessions WHERE id = ?', [bookingDetails.session_id]);
        if (!sessionDetails) {
            return res.status(404).json({ error: 'Session not found for this booking' });
        }
        const movieDetails = yield db.get('SELECT * FROM movies WHERE id = ?', [sessionDetails.movie_id]);
        if (!movieDetails) {
            return res.status(404).json({ error: 'Movie not found for this session' });
        }
        const bookedSeats = yield db.all('SELECT seat FROM booking_seats WHERE booking_id = ?', [bookingId]);
        res.json({
            status: 'valid',
            booking: {
                id: bookingDetails.id,
                name: bookingDetails.name,
                email: bookingDetails.email,
                phone_number: bookingDetails.phone_number,
                seats: bookedSeats.map((s) => s.seat),
                session: sessionDetails,
                movie: movieDetails,
            },
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
        }
        else {
            yield handleDbError(res, error, 'Failed to verify booking');
        }
    }
}));
// Admin: Add a movie with improved error handling and file path handling
app.post('/admin/movies', upload, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.files || !req.files['image']) {
            return res.status(400).json({ error: 'Image file is required' });
        }
        const movieData = MovieSchema.parse(Object.assign(Object.assign({}, req.body), { image: req.files['image'][0].path, wide_image: req.files['wide_image'] ? req.files['wide_image'][0].path : null }));
        const db = yield openDb();
        const { lastID } = yield db.run('INSERT INTO movies (title, description, duration, genre, actors, release_date, transfer_link, image, wide_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
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
        res.json({ id: lastID });
    }
    catch (error) {
        if (error instanceof multer_1.default.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File size exceeds limit (5MB)' });
            }
            else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({ error: 'Unexpected file type' });
            }
            return res.status(400).json({ error: `Multer Error: ${error.message}` });
        }
        else if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
        }
        else if (error.message === 'Image file is required') {
            res.status(400).json({ error: 'Image file is required' });
        }
        else {
            yield handleDbError(res, error, 'Failed to add movie');
        }
    }
}));
// Serve uploaded images
app.use('/uploads', express_1.default.static('uploads'));
// Admin: Add a session with improved error handling
app.post('/admin/sessions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const session = SessionSchema.parse(req.body);
        const db = yield openDb();
        const { lastID } = yield db.run('INSERT INTO sessions (movie_id, audio, subtitle, hall_no, date, time) VALUES (?, ?, ?, ?, ?, ?)', [
            session.movie_id,
            session.audio,
            session.subtitle,
            session.hall_no,
            session.date,
            session.time,
        ]);
        res.json({ id: lastID });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
        }
        else {
            yield handleDbError(res, error, 'Failed to add session');
        }
    }
}));
// Admin: Update a session with improved error handling
app.put('/admin/sessions/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const session = SessionSchema.parse(req.body);
        const db = yield openDb();
        const { changes } = yield db.run('UPDATE sessions SET movie_id = ?, audio = ?, subtitle = ?, hall_no = ?, date = ?, time = ? WHERE id = ?', [
            session.movie_id,
            session.audio,
            session.subtitle,
            session.hall_no,
            session.date,
            session.time,
            req.params.id,
        ]);
        if (changes === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json({ id: req.params.id });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: error.issues });
        }
        else {
            yield handleDbError(res, error, 'Failed to update session');
        }
    }
}));
// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
