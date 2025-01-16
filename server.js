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
const morgan_1 = __importDefault(require("morgan")); // For logging HTTP requests
const cors_1 = __importDefault(require("cors")); // Import the cors package
const multer_1 = __importDefault(require("multer"));
const app = (0, express_1.default)();
// Configure multer for file uploads
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads'); // Save files in the 'uploads' directory
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Unique filename
    },
});
const upload = (0, multer_1.default)({ storage });
app.use(express_1.default.json());
// Logging middleware (using morgan)
app.use((0, morgan_1.default)('combined')); // Logs all HTTP requests in the console
// allow cors
// Enable CORS for all routes
app.use((0, cors_1.default)({
    origin: 'http://localhost:5173', // Allow requests from your React app
    credentials: true, // Allow cookies and credentials (if needed)
}));
// Custom middleware to check for specific headers
const headerCheckMiddleware = (req, res, next) => {
    const requiredHeader = 'x-required-header'; // Replace with your required header
    console.log('checking for header');
    //   if (!req.headers[requiredHeader]) {
    //     return res
    //       .status(400)
    //       .json({ error: `Missing required header: ${requiredHeader}` });
    //   }
    next(); // Proceed to the next middleware/route
};
// Apply header check middleware to all routes
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
// Create tables
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
// Zod schemas for validation
const MovieSchema = zod_1.z.object({
    title: zod_1.z.string(),
    description: zod_1.z.string(),
    duration: zod_1.z.string(),
    genre: zod_1.z.string().optional(),
    actors: zod_1.z.string().optional(),
    release_date: zod_1.z.string(),
    transfer_link: zod_1.z.string().optional(),
    //image: this is a file
    //wide_image: this is also a file but optional
});
const SessionSchema = zod_1.z.object({
    movie_id: zod_1.z.number(),
    audio: zod_1.z.string(),
    subtitle: zod_1.z.string().optional(),
    hall_no: zod_1.z.number(),
    date: zod_1.z.string(),
    time: zod_1.z.string(),
});
const BookingSchema = zod_1.z.object({
    session_id: zod_1.z.number(),
    name: zod_1.z.string(),
    email: zod_1.z.string().email(),
    phone_number: zod_1.z.string(),
    seats: zod_1.z.array(zod_1.z.string()),
});
// Endpoints
// Get all movies
app.get('/movies', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const movies = yield db.all('SELECT * FROM movies');
        res.json(movies);
    }
    catch (error) {
        console.error('Error fetching movies:', error);
        res.status(500).json({ error: 'Failed to fetch movies' });
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
        console.error('Error fetching movie:', error);
        res.status(500).json({ error: 'Failed to fetch movie' });
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
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
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
        console.error('Error fetching session:', error);
        res.status(500).json({ error: 'Failed to fetch session' });
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
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
}));
// Get seats for a session
app.get('/sessions/:id/seats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = yield openDb();
        const sessionId = req.params.id;
        // Fetch seats for the session
        const seats = yield db.all('SELECT seat FROM booking_seats WHERE session_id = ?', [sessionId]);
        // Fetch session details
        const sessionDetails = yield db.get('SELECT * FROM sessions WHERE id = ?', [
            sessionId,
        ]);
        if (!sessionDetails) {
            return res.status(404).json({ error: 'Session not found' });
        }
        // Fetch movie details using the movie_id from the session
        const movieDetails = yield db.get('SELECT * FROM movies WHERE id = ?', [
            sessionDetails.movie_id,
        ]);
        if (!movieDetails) {
            return res.status(404).json({ error: 'Movie not found' });
        }
        // Return the combined data
        res.json({
            seats: seats.map((s) => s.seat),
            sessionDetails,
            movieDetails,
        });
    }
    catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
}));
// Book seats
app.post('/book', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const db = yield openDb();
    let transactionActive = false; // Track if a transaction is active
    try {
        const booking = BookingSchema.parse(req.body);
        // Start transaction
        yield db.run('BEGIN TRANSACTION');
        transactionActive = true; // Mark transaction as active
        // Insert booking
        const { lastID: bookingId } = yield db.run('INSERT INTO bookings (session_id, name, email, phone_number) VALUES (?, ?, ?, ?)', [booking.session_id, booking.name, booking.email, booking.phone_number]);
        // Insert seats
        for (const seat of booking.seats) {
            yield db.run('INSERT INTO booking_seats (booking_id, session_id, seat) VALUES (?, ?, ?)', [bookingId, booking.session_id, seat]);
        }
        // Commit transaction
        yield db.run('COMMIT');
        transactionActive = false; // Mark transaction as inactive
        res.json({ success: true });
    }
    catch (error) {
        // Rollback only if the transaction is still active
        if (transactionActive) {
            yield db.run('ROLLBACK');
        }
        console.error('Error booking seats:', error);
        res.status(400).json({ error: 'Failed to book seats', details: error });
    }
}));
// Admin: Add a movie
app.post('/admin/movies', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'wide_image', maxCount: 1 },
]), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Parse and validate the request body
        const movie = MovieSchema.parse(req.body);
        // const movie = req.body;
        // Get file paths for uploaded images
        const files = req.files;
        // Check if the required 'image' file is present
        if (!files['image'] || files['image'].length === 0) {
            throw new Error('Image file is required');
        }
        const imagePath = files['image'] ? files['image'][0].path : null;
        const wideImagePath = files['wide_image']
            ? files['wide_image'][0].path
            : null;
        // Insert movie into the database
        const db = yield openDb();
        const { lastID } = yield db.run('INSERT INTO movies (title, description, duration, genre, actors, release_date, transfer_link, image, wide_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            movie.title,
            movie.description,
            movie.duration,
            movie.genre,
            movie.actors,
            movie.release_date,
            movie.transfer_link,
            imagePath,
            wideImagePath,
        ]);
        res.json({ id: lastID });
    }
    catch (error) {
        console.error('Error adding movie:', error);
        res.status(400).json({ error: 'Failed to add movie', details: error });
    }
}));
// Serve uploaded images
app.use('/uploads', express_1.default.static('uploads'));
// Admin: Add a session
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
        console.error('Error adding session:', error);
        res.status(400).json({ error: 'Failed to add session', details: error });
    }
}));
//Admin update a session
// Admin: Update a session
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
            res.status(404).json({ error: 'Session not found' });
        }
        else {
            res.json({ id: req.params.id });
        }
    }
    catch (error) {
        console.error('Error updating session:', error);
        res.status(400).json({ error: 'Failed to update session', details: error });
    }
}));
// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
