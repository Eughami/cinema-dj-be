import express, { Request, Response, NextFunction } from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { z } from 'zod';
import morgan from 'morgan';
import cors from 'cors';
import multer from 'multer';

// Define a custom error type for better error handling
class ServerError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ServerError';
  }
}

const app = express();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

app.use(express.json());
app.use(morgan('combined'));

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
);

// Custom middleware to check for specific headers (currently inactive)
const headerCheckMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // const requiredHeader = 'x-required-header';
  // if (!req.headers[requiredHeader]) {
  //   return res.status(400).json({ error: `Missing required header: ${requiredHeader}` });
  // }
  next();
};

app.use(headerCheckMiddleware);

// Open SQLite database
async function openDb() {
  return open({
    filename: './database.db',
    driver: sqlite3.Database,
  });
}

// Initialize database (create tables if they don't exist)
async function initializeDb() {
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

initializeDb();

// Zod schemas for input validation with improved type safety and error messages
const MovieSchema = z.object({
  title: z.string().min(1, { message: 'Title is required' }),
  description: z.string().min(1, { message: 'Description is required' }),
  duration: z.string().regex(/^\d+$/, { message: 'Duration must be a number' }),
  genre: z.string().optional(),
  actors: z.string().optional(),
  release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format. Use YYYY-MM-DD' }),
  transfer_link: z.string().url({ message: 'Invalid URL' }).optional(),
  image: z.string().min(1, { message: 'Image path is required' }), // Assuming you'll provide the path
  wide_image: z.string().optional(), // Wide image is optional
});

const SessionSchema = z.object({
  movie_id: z.number().min(1, { message: 'Movie ID is required' }),
  audio: z.string().min(1, { message: 'Audio is required' }),
  subtitle: z.string().optional(),
  hall_no: z.number().min(1, { message: 'Hall number is required' }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format. Use YYYY-MM-DD' }),
  time: z.string().regex(/^\d{2}:\d{2}$/, { message: 'Invalid time format. Use HH:MM' }),
});

const BookingSchema = z.object({
  session_id: z.number().min(1, { message: 'Session ID is required' }),
  name: z.string().min(1, { message: 'Name is required' }),
  email: z.string().email({ message: 'Invalid email address' }),
  phone_number: z.string().min(1, { message: 'Phone number is required' }),
  seats: z.array(z.string().min(1, { message: 'Seat is required' })),
});

// Helper function to handle database errors
async function handleDbError(
  res: Response,
  error: any,
  errorMessage: string
): Promise<void> {
  console.error('Database error:', error);
  res.status(500).json({ error: errorMessage, details: error.message });
}

// Endpoints with improved error handling and type safety

// Get all movies
app.get('/movies', async (req: Request, res: Response) => {
  try {
    const db = await openDb();
    const movies = await db.all('SELECT * FROM movies');
    res.json(movies);
  } catch (error) {
    await handleDbError(res, error, 'Failed to fetch movies');
  }
});

// Get a movie by ID
app.get('/movies/:id', async (req: Request, res: Response) => {
  try {
    const db = await openDb();
    const movie = await db.get('SELECT * FROM movies WHERE id = ?', [
      req.params.id,
    ]);
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json(movie);
  } catch (error) {
    await handleDbError(res, error, 'Failed to fetch movie');
  }
});

// Get all sessions
app.get('/sessions', async (req: Request, res: Response) => {
  try {
    const db = await openDb();
    const sessions = await db.all('SELECT * FROM sessions');
    res.json(sessions);
  } catch (error) {
    await handleDbError(res, error, 'Failed to fetch sessions');
  }
});

// Get a session by ID
app.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const db = await openDb();
    const session = await db.get('SELECT * FROM sessions WHERE id = ?', [
      req.params.id,
    ]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    await handleDbError(res, error, 'Failed to fetch session');
  }
});

// Get session by movie
app.get('/movies/:id/sessions', async (req: Request, res: Response) => {
  try {
    const db = await openDb();
    const sessions = await db.all(
      'SELECT * FROM sessions WHERE movie_id = ?',
      req.params.id
    );
    res.json(sessions);
  } catch (error) {
    await handleDbError(res, error, 'Failed to fetch sessions');
  }
});

// Get seats for a session
app.get('/sessions/:id/seats', async (req: Request, res: Response) => {
  try {
    const db = await openDb();
    const sessionId = req.params.id;

    const seats = await db.all(
      'SELECT seat FROM booking_seats WHERE session_id = ?',
      [sessionId]
    );

    const sessionDetails = await db.get('SELECT * FROM sessions WHERE id = ?', [
      sessionId,
    ]);

    if (!sessionDetails) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const movieDetails = await db.get('SELECT * FROM movies WHERE id = ?', [
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
  } catch (error) {
    await handleDbError(res, error, 'Failed to fetch data');
  }
});

// Book seats with improved error handling
app.post('/book', async (req: Request, res: Response) => {
  const db = await openDb();
  let transactionActive = false;

  try {
    const booking = BookingSchema.parse(req.body);

    await db.run('BEGIN TRANSACTION');
    transactionActive = true;

    const { lastID: bookingId } = await db.run(
      'INSERT INTO bookings (session_id, name, email, phone_number) VALUES (?, ?, ?, ?)',
      [booking.session_id, booking.name, booking.email, booking.phone_number]
    );

    for (const seat of booking.seats) {
      await db.run(
        'INSERT INTO booking_seats (booking_id, session_id, seat) VALUES (?, ?, ?)',
        [bookingId, booking.session_id, seat]
      );
    }

    await db.run('COMMIT');
    transactionActive = false;
    res.json({ success: true });
  } catch (error) {
    if (transactionActive) {
      await db.run('ROLLBACK');
    }
    await handleDbError(res, error, 'Failed to book seats');
  }
});

// Admin: Add a movie with improved error handling and file path handling
app.post(
  '/admin/movies',
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'wide_image', maxCount: 1 }]),
  async (req: Request, res: Response) => {
    try {
      const movieData = MovieSchema.parse({
        ...req.body,
        image: req.files['image'][0].path,
        wide_image: req.files['wide_image'] ? req.files['wide_image'][0].path : null,
      });

      const db = await openDb();
      const { lastID } = await db.run(
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
      res.json({ id: lastID });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: error.issues });
      } else if (error.message === 'Image file is required') {
        res.status(400).json({ error: 'Image file is required' });
      } else {
        await handleDbError(res, error, 'Failed to add movie');
      }
    }
  }
);

// Serve uploaded images
app.use('/uploads', express.static('uploads'));

// Admin: Add a session with improved error handling
app.post('/admin/sessions', async (req: Request, res: Response) => {
  try {
    const session = SessionSchema.parse(req.body);
    const db = await openDb();
    const { lastID } = await db.run(
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
    res.json({ id: lastID });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      await handleDbError(res, error, 'Failed to add session');
    }
  }
});

// Admin: Update a session with improved error handling
app.put('/admin/sessions/:id', async (req: Request, res: Response) => {
  try {
    const session = SessionSchema.parse(req.body);
    const db = await openDb();
    const { changes } = await db.run(
      'UPDATE sessions SET movie_id = ?, audio = ?, subtitle = ?, hall_no = ?, date = ?, time = ? WHERE id = ?',
      [
        session.movie_id,
        session.audio,
        session.subtitle,
        session.hall_no,
        session.date,
        session.time,
        req.params.id,
      ]
    );

    if (changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ id: req.params.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      await handleDbError(res, error, 'Failed to update session');
    }
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

