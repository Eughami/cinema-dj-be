import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { writeFile } from 'fs/promises';
import path from 'path';

type SqliteDb = Database<sqlite3.Database, sqlite3.Statement>;

interface CatalogMovie {
  title: string;
  description: string;
  duration: number;
  genre: string;
  actors: string;
  posterSeed: string;
}

interface MovieRow {
  id: number;
  title: string;
  description: string;
  duration: number;
  genre: string | null;
  actors: string | null;
  release_date: string;
  transfer_link: string | null;
  image: string;
  wide_image: string | null;
}

interface SessionRow {
  id: number;
  movie_id: number;
  audio: string;
  subtitle: string | null;
  hall_no: number;
  date: string;
  time: string;
}

interface SchedulerOptions {
  auto: boolean;
  force: boolean;
  sessionsOnly: boolean;
  dryRun: boolean;
  tmdb: boolean;
  dbPath: string;
  todayOverride: string;
}

interface PlannedSession {
  movie_id: number;
  audio: string;
  subtitle: string | null;
  hall_no: number;
  date: string;
  time: string;
}

interface TimeInterval {
  start: number;
  end: number;
}

interface ScheduleSummary {
  today: string;
  weekStart: string;
  weekEnd: string;
  moviesAdded: number;
  sessionsAdded: number;
  sessionsSkipped: number;
  addedTitles: string[];
}

interface MovieEntryInput {
  movie: CatalogMovie;
  releaseDate: string;
  tmdbId: number | null;
  image: string;
  wideImage: string | null;
}

interface TmdbListItem {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number;
}

interface TmdbGenre {
  name: string;
}

interface TmdbDetails {
  runtime: number | null;
  genres: TmdbGenre[];
  overview: string;
}

interface TmdbCastMember {
  name: string;
}

interface TmdbCredits {
  cast: TmdbCastMember[];
}

const HALLS: number[] = [1, 2];
const OPEN_MINUTES: number = 11 * 60;
const LAST_START_MINUTES: number = 22 * 60 + 30;
const LATEST_END_MINUTES: number = 23 * 60 + 59;
const CLEANING_BUFFER_MINUTES: number = 30;
const CURSOR_STEP_MINUTES: number = 15;
const MAX_MOVIE_AGE_DAYS: number = 30;
const NEW_MOVIES_PER_WEEK: number = 2;
const FUTURE_RELEASE_OFFSET_DAYS: number = 21;
const SCHEDULER_INTERVAL_MS: number = 60 * 60 * 1000;
const TMDB_API_BASE: string = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE: string = 'https://image.tmdb.org/t/p';
const TMDB_REQUEST_DELAY_MS: number = 200;

const CATALOG: CatalogMovie[] = [
  {
    title: 'Avengers: Doomsday',
    description:
      "Les Avengers se reforment face au Docteur Fatalis, une menace capable de briser le multivers. Le destin de tous les univers se joue dans une bataille sans précédent.",
    duration: 170,
    genre: 'Action, Aventure, Science-Fiction',
    actors: 'Robert Downey Jr., Chris Hemsworth, Anthony Mackie',
    posterSeed: 'avengers-doomsday',
  },
  {
    title: 'Dune : Troisieme partie',
    description:
      "Paul Atreides, devenu Empereur, voit son jihad embraser l'univers connu. Entre visions et trahisons, il devra affronter le prix de son destin.",
    duration: 165,
    genre: 'Science-Fiction, Aventure',
    actors: 'Timothee Chalamet, Zendaya, Florence Pugh',
    posterSeed: 'dune-partie-3',
  },
  {
    title: 'Shrek 5',
    description:
      "Shrek et Fiona voient leur marécage bousculé par une nouvelle génération d'ogres. Une aventure familiale pleine d'humour les attend au-delà des marais.",
    duration: 100,
    genre: 'Animation, Comedie, Famille',
    actors: 'Mike Myers, Eddie Murphy, Cameron Diaz',
    posterSeed: 'shrek-5',
  },
  {
    title: 'Toy Story 5',
    description:
      "Woody et Buzz affrontent l'arrivée des jouets connectés. Pour rester les favoris de Bonnie, les jouets devront se réinventer.",
    duration: 105,
    genre: 'Animation, Famille, Comedie',
    actors: 'Tom Hanks, Tim Allen, Joan Cusack',
    posterSeed: 'toy-story-5',
  },
  {
    title: 'Spider-Man: Brand New Day',
    description:
      "Oublié du monde entier, Peter Parker reprend du service à New York. Un nouveau départ qui le confronte à des ennemis inédits.",
    duration: 145,
    genre: 'Action, Aventure',
    actors: 'Tom Holland, Zendaya, Jacob Batalon',
    posterSeed: 'spiderman-brand-new-day',
  },
  {
    title: 'The Mandalorian & Grogu',
    description:
      "Din Djarin et Grogu parcourent la galaxie pour une mission cruciale de la Nouvelle République. Le lien entre le Mandalorien et son apprenti sera mis à l'épreuve.",
    duration: 130,
    genre: 'Science-Fiction, Aventure',
    actors: 'Pedro Pascal, Sigourney Weaver',
    posterSeed: 'mandalorian-grogu',
  },
  {
    title: "L'Odyssee",
    description:
      "Après la guerre de Troie, Ulysse entame un périlleux voyage de retour vers Ithaque. Dieux, monstres et tentations jalonneront sa route.",
    duration: 160,
    genre: 'Aventure, Drame, Histoire',
    actors: 'Matt Damon, Tom Holland, Anne Hathaway',
    posterSeed: 'odyssee-nolan',
  },
  {
    title: 'Super Mario Galaxy : Le Film',
    description:
      "Mario et Luigi s'envolent vers les galaxies pour sauver la princesse Peach. Une odyssée cosmique pleine de étoiles et de passages secrets.",
    duration: 95,
    genre: 'Animation, Famille, Aventure',
    actors: 'Chris Pratt, Anya Taylor-Joy, Jack Black',
    posterSeed: 'mario-galaxy-film',
  },
  {
    title: 'Hunger Games : Lever de soleil sur la moisson',
    description:
      "Cinquante ans avant Katniss, le jeune Haymitch est jeté dans l'arène des 50es Hunger Games. Un récit d'origine brutal et émouvant.",
    duration: 150,
    genre: 'Action, Drame, Science-Fiction',
    actors: 'Joseph Zada, Whitney Peak, Jesse Plemons',
    posterSeed: 'hunger-games-moisson',
  },
  {
    title: 'Scream 7',
    description:
      "Ghostface frappe à nouveau et Sidney Prescott doit sortir de sa retraite. Le tueur masqué n'a jamais été aussi proche.",
    duration: 115,
    genre: 'Horreur, Thriller',
    actors: 'Neve Campbell, Courteney Cox, Mason Gooding',
    posterSeed: 'scream-7',
  },
  {
    title: 'Godzilla x Kong : Supernova',
    description:
      "Godzilla et Kong unissent leurs forces contre une menace cosmique qui s'abat sur la Terre. Le sort des Titans et des humains est en jeu.",
    duration: 135,
    genre: 'Action, Science-Fiction',
    actors: 'Dan Stevens, Rebecca Hall, Brian Tyree Henry',
    posterSeed: 'godzilla-kong-supernova',
  },
  {
    title: 'Star Wars: Starfighter',
    description:
      "Cinq ans après l'ascension de Skywalker, un jeune pilote se lance dans une mission désespérée aux confins de la galaxie.",
    duration: 140,
    genre: 'Science-Fiction, Aventure',
    actors: 'Ryan Gosling, Mia Goth, Matt Smith',
    posterSeed: 'star-wars-starfighter',
  },
  {
    title: "L'Age de glace 6",
    description:
      "Manny, Diego et Sid repartent pour une expédition glaciale. Scrat poursuit toujours son gland à travers les catastrophes.",
    duration: 100,
    genre: 'Animation, Comedie, Famille',
    actors: 'Ray Romano, John Leguizamo, Denis Leary',
    posterSeed: 'age-de-glace-6',
  },
  {
    title: 'Jumanji 4',
    description:
      "Le jeu maudit aspire une nouvelle fois ses joueurs dans la jungle. Les avatars devront survivre à un niveau plus dangereux que jamais.",
    duration: 125,
    genre: 'Aventure, Comedie',
    actors: 'Dwayne Johnson, Kevin Hart, Karen Gillan',
    posterSeed: 'jumanji-4',
  },
  {
    title: 'Le Diable shabille en Prada 2',
    description:
      "Miranda Priestly affronte un empire de la mode en pleine mutation. Andy Sachs revient dans un monde du luxe bouleversé par le numérique.",
    duration: 110,
    genre: 'Comedie, Drame',
    actors: 'Meryl Streep, Anne Hathaway, Emily Blunt',
    posterSeed: 'diable-prada-2',
  },
  {
    title: 'Narnia : Le Neveu du magicien',
    description:
      "Avant l'armoire magique, deux enfants découvrent la naissance du monde de Narnia. La légende des origines enfin portée à l'écran.",
    duration: 150,
    genre: 'Fantastique, Aventure, Famille',
    actors: 'Daniel Craig, Carey Mulligan',
    posterSeed: 'narnia-neveu-magicien',
  },
];

export function parseArgs(argv: string[]): SchedulerOptions {
  const args: string[] = argv.slice(2);
  const options: SchedulerOptions = {
    auto: false,
    force: false,
    sessionsOnly: false,
    dryRun: false,
    tmdb: false,
    dbPath: './database.db',
    todayOverride: '',
  };

  for (const arg of args) {
    if (arg === '--auto') {
      options.auto = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--sessions-only') {
      options.sessionsOnly = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--tmdb') {
      options.tmdb = true;
    } else if (arg.startsWith('--db=')) {
      options.dbPath = arg.slice('--db='.length);
    } else if (arg.startsWith('--date=')) {
      options.todayOverride = arg.slice('--date='.length);
    }
  }

  return options;
}

export function formatDateString(date: Date): string {
  const year: number = date.getFullYear();
  const month: string = String(date.getMonth() + 1).padStart(2, '0');
  const day: string = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDateString(dateString: string, days: number): string {
  const parsed: Date = new Date(`${dateString}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return formatDateString(parsed);
}

export function isWednesdayDate(dateString: string): boolean {
  const parsed: Date = new Date(`${dateString}T12:00:00`);
  return parsed.getDay() === 3;
}

export function timeToMinutes(timeString: string): number {
  const parts: string[] = timeString.split(':');
  const hours: number = Number(parts[0]);
  const minutes: number = Number(parts[1]);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const hours: string = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes: string = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function buildPosterUrl(posterSeed: string, wide: boolean): string {
  if (wide) {
    return `https://picsum.photos/seed/cinema-${posterSeed}-wide/800/450`;
  }
  return `https://picsum.photos/seed/cinema-${posterSeed}/400/600`;
}

export function getTmdbApiKey(): string {
  const apiKey: string = process.env.TMDB_API_KEY ?? '';
  return apiKey.trim();
}

export function isTmdbConfigured(): boolean {
  return getTmdbApiKey().length > 0;
}

export function getTmdbRegion(): string {
  const region: string = process.env.TMDB_REGION ?? '';
  return region.trim() !== '' ? region.trim() : 'FR';
}

export function getTmdbLanguage(): string {
  const language: string = process.env.TMDB_LANGUAGE ?? '';
  return language.trim() !== '' ? language.trim() : 'fr-FR';
}

export function getTmdbMaxNowPlaying(): number {
  const parsed: number = Number(process.env.TMDB_MAX_NOW_PLAYING);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 20) {
    return parsed;
  }
  return 5;
}

export function getTmdbMaxUpcoming(): number {
  const parsed: number = Number(process.env.TMDB_MAX_UPCOMING);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 20) {
    return parsed;
  }
  return 2;
}

export function shouldAddMovies(today: string, options: SchedulerOptions): boolean {
  if (options.sessionsOnly) {
    return false;
  }
  if (options.force || options.tmdb) {
    return true;
  }
  if (options.auto && isTmdbConfigured()) {
    return false;
  }
  return isWednesdayDate(today);
}

export function delayMs(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve: (value: void) => void) => {
    setTimeout(() => resolve(), milliseconds);
  });
}

export async function tmdbGet<T>(apiPath: string): Promise<T> {
  const apiKey: string = getTmdbApiKey();
  if (apiKey === '') {
    throw new Error('TMDB_API_KEY manquant. Ajoutez votre clé TMDB dans le fichier .env.');
  }
  const separator: string = apiPath.includes('?') ? '&' : '?';
  const url: string = `${TMDB_API_BASE}${apiPath}${separator}api_key=${encodeURIComponent(apiKey)}`;
  const response: Response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Appel TMDB échoué (${response.status}) sur ${apiPath}.`);
  }
  const data: T = (await response.json()) as T;
  return data;
}

export async function fetchTmdbList(endpoint: string): Promise<TmdbListItem[]> {
  const region: string = getTmdbRegion();
  const language: string = getTmdbLanguage();
  const collected: TmdbListItem[] = [];
  for (const page of [1, 2]) {
    const data: { results: TmdbListItem[] } = await tmdbGet<{ results: TmdbListItem[] }>(
      `${endpoint}?language=${encodeURIComponent(language)}&region=${encodeURIComponent(region)}&page=${page}`
    );
    for (const item of data.results) {
      collected.push(item);
    }
    await delayMs(TMDB_REQUEST_DELAY_MS);
  }
  return collected;
}

export async function fetchTmdbDetails(tmdbId: number): Promise<TmdbDetails> {
  const language: string = getTmdbLanguage();
  const details: TmdbDetails = await tmdbGet<TmdbDetails>(
    `/movie/${tmdbId}?language=${encodeURIComponent(language)}`
  );
  await delayMs(TMDB_REQUEST_DELAY_MS);
  return details;
}

export async function fetchTmdbCastNames(tmdbId: number): Promise<string> {
  const credits: TmdbCredits = await tmdbGet<TmdbCredits>(`/movie/${tmdbId}/credits`);
  await delayMs(TMDB_REQUEST_DELAY_MS);
  const names: string[] = [];
  for (const member of credits.cast.slice(0, 5)) {
    if (member.name.trim() !== '') {
      names.push(member.name.trim());
    }
  }
  return names.join(', ');
}

export function isValidReleaseDate(releaseDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(releaseDate);
}

export async function downloadImageToUploads(
  imageUrl: string,
  fileName: string,
  dbPath: string
): Promise<string | null> {
  try {
    const response: Response = await fetch(imageUrl);
    if (!response.ok) {
      console.log(`Téléchargement image ignoré (${response.status}) : ${imageUrl}`);
      return null;
    }
    const buffer: ArrayBuffer = await response.arrayBuffer();
    const uploadsDir: string = path.resolve(path.dirname(dbPath), 'uploads');
    const filePath: string = path.join(uploadsDir, fileName);
    await writeFile(filePath, Buffer.from(buffer));
    return `uploads/${fileName}`;
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : 'Erreur inconnue';
    console.log(`Téléchargement image échoué (${message}) : ${imageUrl}`);
    return null;
  }
}

export async function ensureTmdbColumn(db: SqliteDb): Promise<void> {
  try {
    await db.exec('ALTER TABLE movies ADD COLUMN tmdb_id INTEGER');
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('duplicate column')) {
      throw error;
    }
  }
}

async function getExistingTmdbIds(db: SqliteDb): Promise<Set<number>> {
  const rows: { tmdb_id: number | null }[] = await db.all<{ tmdb_id: number | null }[]>(
    'SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL'
  );
  const ids: Set<number> = new Set<number>();
  for (const row of rows) {
    if (row.tmdb_id !== null) {
      ids.add(row.tmdb_id);
    }
  }
  return ids;
}

async function buildRealEntry(
  item: TmdbListItem,
  dbPath: string,
  dryRun: boolean
): Promise<MovieEntryInput | null> {
  if (!isValidReleaseDate(item.release_date)) {
    return null;
  }
  const details: TmdbDetails = await fetchTmdbDetails(item.id);
  const actors: string = await fetchTmdbCastNames(item.id);
  const genres: string = details.genres.map((genre: TmdbGenre) => genre.name).join(', ');
  const description: string =
    item.overview.trim() !== ''
      ? item.overview.trim()
      : details.overview.trim() !== ''
        ? details.overview.trim()
        : 'Synopsis non disponible pour le moment.';
  const duration: number =
    details.runtime !== null && details.runtime > 0 ? details.runtime : 120;
  const stamp: string = String(Date.now());
  let image: string = '';
  let wideImage: string | null = null;
  if (item.poster_path !== null) {
    const posterUrl: string = `${TMDB_IMAGE_BASE}/w500${item.poster_path}`;
    if (dryRun) {
      image = posterUrl;
    } else {
      const saved: string | null = await downloadImageToUploads(
        posterUrl,
        `${stamp}-tmdb-${item.id}-poster.jpg`,
        dbPath
      );
      image = saved ?? posterUrl;
    }
  }
  if (item.backdrop_path !== null) {
    const backdropUrl: string = `${TMDB_IMAGE_BASE}/w1280${item.backdrop_path}`;
    if (dryRun) {
      wideImage = backdropUrl;
    } else {
      const saved: string | null = await downloadImageToUploads(
        backdropUrl,
        `${stamp}-tmdb-${item.id}-wide.jpg`,
        dbPath
      );
      wideImage = saved ?? backdropUrl;
    }
  }
  if (image === '') {
    return null;
  }
  return {
    movie: {
      title: item.title,
      description,
      duration,
      genre: genres,
      actors,
      posterSeed: `tmdb-${item.id}`,
    },
    releaseDate: item.release_date,
    tmdbId: item.id,
    image,
    wideImage,
  };
}

export async function fetchRealMovieEntries(
  weekEnd: string,
  dbPath: string,
  dryRun: boolean,
  existingTitles: Set<string>,
  existingTmdbIds: Set<number>
): Promise<MovieEntryInput[]> {
  const maxNowPlaying: number = getTmdbMaxNowPlaying();
  const maxUpcoming: number = getTmdbMaxUpcoming();
  const nowPlaying: TmdbListItem[] = await fetchTmdbList('/movie/now_playing');
  const upcoming: TmdbListItem[] = await fetchTmdbList('/movie/upcoming');
  const entries: MovieEntryInput[] = [];

  for (const item of nowPlaying) {
    if (entries.length >= maxNowPlaying) {
      break;
    }
    if (existingTmdbIds.has(item.id)) {
      continue;
    }
    if (existingTitles.has(item.title.trim().toLowerCase())) {
      continue;
    }
    if (item.poster_path === null) {
      continue;
    }
    const entry: MovieEntryInput | null = await buildRealEntry(item, dbPath, dryRun);
    if (entry !== null) {
      entries.push(entry);
      existingTmdbIds.add(item.id);
    }
  }

  let upcomingAdded: number = 0;
  for (const item of upcoming) {
    if (upcomingAdded >= maxUpcoming) {
      break;
    }
    if (!isValidReleaseDate(item.release_date) || item.release_date <= weekEnd) {
      continue;
    }
    if (existingTmdbIds.has(item.id)) {
      continue;
    }
    if (existingTitles.has(item.title.trim().toLowerCase())) {
      continue;
    }
    if (item.poster_path === null) {
      continue;
    }
    const entry: MovieEntryInput | null = await buildRealEntry(item, dbPath, dryRun);
    if (entry !== null) {
      entries.push(entry);
      existingTmdbIds.add(item.id);
      upcomingAdded += 1;
    }
  }

  return entries;
}

export function intervalsOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number
): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function fitsWithoutOverlap(
  blocked: TimeInterval[],
  start: number,
  end: number
): boolean {
  for (const interval of blocked) {
    if (intervalsOverlap(start, end, interval.start, interval.end)) {
      return false;
    }
  }
  return true;
}

async function openDb(dbPath: string): Promise<SqliteDb> {
  const db: SqliteDb = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
  return db;
}

async function getExistingTitles(db: SqliteDb): Promise<Set<string>> {
  const rows: { title: string }[] = await db.all<{ title: string }[]>(
    'SELECT title FROM movies'
  );
  const titles: Set<string> = new Set<string>();
  for (const row of rows) {
    titles.add(row.title.trim().toLowerCase());
  }
  return titles;
}

export function pickNewCatalogMovies(
  existingTitles: Set<string>,
  count: number
): CatalogMovie[] {
  const picked: CatalogMovie[] = [];
  for (const candidate of CATALOG) {
    if (picked.length >= count) {
      break;
    }
    if (!existingTitles.has(candidate.title.trim().toLowerCase())) {
      picked.push(candidate);
    }
  }
  return picked;
}

async function getAllMovies(db: SqliteDb): Promise<MovieRow[]> {
  const movies: MovieRow[] = await db.all<MovieRow[]>('SELECT * FROM movies');
  return movies;
}

function buildVirtualMovie(entry: MovieEntryInput, index: number): MovieRow {
  return {
    id: -(index + 1),
    title: entry.movie.title,
    description: entry.movie.description,
    duration: entry.movie.duration,
    genre: entry.movie.genre,
    actors: entry.movie.actors,
    release_date: entry.releaseDate,
    transfer_link: null,
    image: entry.image,
    wide_image: entry.wideImage,
  };
}

function catalogEntriesForWeek(picked: CatalogMovie[], today: string): MovieEntryInput[] {
  const farRelease: string = addDaysToDateString(today, FUTURE_RELEASE_OFFSET_DAYS);
  const entries: MovieEntryInput[] = [];
  for (let index = 0; index < picked.length; index++) {
    const movie: CatalogMovie = picked[index];
    entries.push({
      movie,
      releaseDate: index === 0 ? today : farRelease,
      tmdbId: null,
      image: buildPosterUrl(movie.posterSeed, false),
      wideImage: buildPosterUrl(movie.posterSeed, true),
    });
  }
  return entries;
}

async function insertMovieEntries(
  db: SqliteDb,
  entries: MovieEntryInput[],
  dryRun: boolean,
  summary: ScheduleSummary
): Promise<void> {
  for (const entry of entries) {
    if (!dryRun) {
      await db.run(
        'INSERT INTO movies (title, description, duration, genre, actors, release_date, transfer_link, image, wide_image, tmdb_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          entry.movie.title,
          entry.movie.description,
          entry.movie.duration,
          entry.movie.genre,
          entry.movie.actors,
          entry.releaseDate,
          null,
          entry.image,
          entry.wideImage,
          entry.tmdbId,
        ]
      );
    }
    summary.moviesAdded += 1;
    summary.addedTitles.push(`${entry.movie.title} (${entry.releaseDate})`);
  }
  if (entries.length === 0) {
    console.log('Aucun nouveau film à ajouter (catalogue épuisé ou déjà en base).');
  }
}

async function resolveWeeklyEntries(
  db: SqliteDb,
  today: string,
  weekEnd: string,
  dbPath: string,
  dryRun: boolean,
  useTmdb: boolean
): Promise<MovieEntryInput[]> {
  const existingTitles: Set<string> = await getExistingTitles(db);
  if (useTmdb) {
    const existingTmdbIds: Set<number> = await getExistingTmdbIds(db);
    return fetchRealMovieEntries(weekEnd, dbPath, dryRun, existingTitles, existingTmdbIds);
  }
  const picked: CatalogMovie[] = pickNewCatalogMovies(
    existingTitles,
    NEW_MOVIES_PER_WEEK
  );
  return catalogEntriesForWeek(picked, today);
}

function appendVirtualMovies(movies: MovieRow[], entries: MovieEntryInput[]): void {
  for (let index = 0; index < entries.length; index++) {
    movies.push(buildVirtualMovie(entries[index], movies.length + index));
  }
}

function selectEligibleMovies(movies: MovieRow[], weekEnd: string, cutoff: string): MovieRow[] {
  const eligible: MovieRow[] = movies.filter(
    (movie: MovieRow) => movie.release_date <= weekEnd && movie.release_date >= cutoff
  );
  eligible.sort((left: MovieRow, right: MovieRow) =>
    right.release_date.localeCompare(left.release_date)
  );
  return eligible;
}

async function getSessionsInWindow(
  db: SqliteDb,
  weekStart: string,
  weekEnd: string
): Promise<SessionRow[]> {
  const sessions: SessionRow[] = await db.all<SessionRow[]>(
    'SELECT * FROM sessions WHERE date >= ? AND date <= ?',
    [weekStart, weekEnd]
  );
  return sessions;
}

export function buildWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset < 7; offset++) {
    dates.push(addDaysToDateString(weekStart, offset));
  }
  return dates;
}

export function pickAudioTrack(slotIndex: number): {
  audio: string;
  subtitle: string | null;
} {
  const useEnglish: boolean = slotIndex % 4 === 3;
  if (useEnglish) {
    return { audio: 'English', subtitle: 'French' };
  }
  return { audio: 'French', subtitle: null };
}

function planDayForHall(
  date: string,
  hallNo: number,
  candidates: MovieRow[],
  blocked: TimeInterval[],
  startPointer: number
): { planned: PlannedSession[]; nextPointer: number } {
  const planned: PlannedSession[] = [];
  let pointer: number = startPointer % Math.max(candidates.length, 1);
  let cursor: number = OPEN_MINUTES;
  let guard: number = 0;
  let slotIndex: number = 0;

  while (cursor <= LAST_START_MINUTES && guard < 300) {
    guard += 1;
    let placed: boolean = false;

    for (let step = 0; step < candidates.length; step++) {
      const candidate: MovieRow = candidates[(pointer + step) % candidates.length];
      if (candidate.release_date > date) {
        continue;
      }
      const endMinutes: number = cursor + candidate.duration;
      if (endMinutes > LATEST_END_MINUTES) {
        continue;
      }
      const busyEnd: number = endMinutes + CLEANING_BUFFER_MINUTES;
      if (!fitsWithoutOverlap(blocked, cursor, busyEnd)) {
        continue;
      }

      const track = pickAudioTrack(slotIndex);
      planned.push({
        movie_id: candidate.id,
        audio: track.audio,
        subtitle: track.subtitle,
        hall_no: hallNo,
        date,
        time: minutesToTime(cursor),
      });
      blocked.push({ start: cursor, end: busyEnd });
      pointer = (pointer + step + 1) % candidates.length;
      cursor = busyEnd;
      slotIndex += 1;
      placed = true;
      break;
    }

    if (!placed) {
      cursor += CURSOR_STEP_MINUTES;
    }
  }

  return { planned, nextPointer: pointer };
}

export async function runWeeklySchedule(
  argv: string[] = process.argv
): Promise<ScheduleSummary> {
  const options: SchedulerOptions = parseArgs(argv);
  const now: Date = new Date();
  const today: string =
    options.todayOverride.trim() !== '' ? options.todayOverride.trim() : formatDateString(now);
  const weekStart: string = today;
  const weekEnd: string = addDaysToDateString(today, 6);
  const cutoff: string = addDaysToDateString(today, -MAX_MOVIE_AGE_DAYS);

  const summary: ScheduleSummary = {
    today,
    weekStart,
    weekEnd,
    moviesAdded: 0,
    sessionsAdded: 0,
    sessionsSkipped: 0,
    addedTitles: [],
  };

  const db: SqliteDb = await openDb(options.dbPath);

  try {
    await ensureTmdbColumn(db);
    const weeklyDropDue: boolean = shouldAddMovies(today, options);
    let dropEntries: MovieEntryInput[] = [];
    if (weeklyDropDue) {
      dropEntries = await resolveWeeklyEntries(
        db,
        today,
        weekEnd,
        options.dbPath,
        options.dryRun,
        options.tmdb
      );
      await insertMovieEntries(db, dropEntries, options.dryRun, summary);
      if (options.tmdb) {
        console.log(`Synchronisation TMDB : ${dropEntries.length} film(s) réel(s) ajouté(s).`);
      }
    } else {
      console.log('Ajout de films ignoré (hors mercredi ou mode séances uniquement).');
    }

    let movies: MovieRow[] = await getAllMovies(db);
    if (options.dryRun && weeklyDropDue) {
      appendVirtualMovies(movies, dropEntries);
    }

    let eligible: MovieRow[] = selectEligibleMovies(movies, weekEnd, cutoff);

    if (eligible.length === 0 && movies.length > 0 && !options.sessionsOnly) {
      console.log(
        'Aucun film récent : ajout de rattrapage pour éviter un site vide.'
      );
      const healWithTmdb: boolean = !options.force && isTmdbConfigured();
      const entries: MovieEntryInput[] = await resolveWeeklyEntries(
        db,
        today,
        weekEnd,
        options.dbPath,
        options.dryRun,
        healWithTmdb
      );
      await insertMovieEntries(db, entries, options.dryRun, summary);
      if (options.dryRun) {
        appendVirtualMovies(movies, entries);
      } else {
        movies = await getAllMovies(db);
      }
      eligible = selectEligibleMovies(movies, weekEnd, cutoff);
    }

    if (eligible.length === 0 && movies.length > 0) {
      const fallback: MovieRow[] = [...movies].sort((left: MovieRow, right: MovieRow) =>
        right.release_date.localeCompare(left.release_date)
      );
      eligible = fallback.slice(0, 2);
      console.log(
        'Aucun film récent éligible : repli sur les films les plus récents pour éviter un site vide.'
      );
    }

    if (eligible.length === 0) {
      console.log('Aucun film en base : impossible de planifier des séances.');
      await db.close();
      return summary;
    }

    const durationsByMovie: Map<number, number> = new Map<number, number>();
    for (const movie of movies) {
      durationsByMovie.set(movie.id, movie.duration);
    }

    const existingSessions: SessionRow[] = await getSessionsInWindow(
      db,
      weekStart,
      weekEnd
    );
    const blockedByHallDay: Map<string, TimeInterval[]> = new Map<
      string,
      TimeInterval[]
    >();

    for (const session of existingSessions) {
      const duration: number = durationsByMovie.get(session.movie_id) ?? 120;
      const start: number = timeToMinutes(session.time);
      const key: string = `${session.hall_no}|${session.date}`;
      const blocked: TimeInterval[] = blockedByHallDay.get(key) ?? [];
      blocked.push({ start, end: start + duration + CLEANING_BUFFER_MINUTES });
      blockedByHallDay.set(key, blocked);
    }

    const weekDates: string[] = buildWeekDates(weekStart);
    const plannedSessions: PlannedSession[] = [];
    let pointer: number = 0;

    for (const date of weekDates) {
      const releasedForDay: MovieRow[] = eligible.filter(
        (movie: MovieRow) => movie.release_date <= date
      );
      if (releasedForDay.length === 0) {
        continue;
      }
      const dayCandidates: MovieRow[] = releasedForDay;

      for (const hallNo of HALLS) {
        const key: string = `${hallNo}|${date}`;
        const blocked: TimeInterval[] = blockedByHallDay.get(key) ?? [];
        const result = planDayForHall(date, hallNo, dayCandidates, blocked, pointer);
        pointer = result.nextPointer;
        blockedByHallDay.set(key, blocked);
        for (const planned of result.planned) {
          plannedSessions.push(planned);
        }
      }
    }

    if (!options.dryRun) {
      for (const planned of plannedSessions) {
        try {
          await db.run(
            'INSERT INTO sessions (movie_id, audio, subtitle, hall_no, date, time) VALUES (?, ?, ?, ?, ?, ?)',
            [
              planned.movie_id,
              planned.audio,
              planned.subtitle,
              planned.hall_no,
              planned.date,
              planned.time,
            ]
          );
          summary.sessionsAdded += 1;
        } catch (error: unknown) {
          summary.sessionsSkipped += 1;
        }
      }
    } else {
      summary.sessionsAdded = plannedSessions.length;
    }

    console.log(
      `Semaine ${weekStart} -> ${weekEnd} : ${summary.moviesAdded} film(s), ${summary.sessionsAdded} séance(s) planifiée(s), ${summary.sessionsSkipped} ignorée(s).`
    );
    if (summary.addedTitles.length > 0) {
      console.log(`Nouveautés : ${summary.addedTitles.join(' | ')}`);
    }

    await db.close();
    return summary;
  } catch (error: unknown) {
    await db.close();
    throw error;
  }
}

export function startWeeklyScheduler(): void {
  const disabled: boolean = process.env.DISABLE_WEEKLY_SCHEDULER === '1';
  if (disabled) {
    console.log('Planificateur hebdomadaire désactivé (DISABLE_WEEKLY_SCHEDULER=1).');
    return;
  }

  const runAuto = (): void => {
    runWeeklySchedule(['node', 'weekly-schedule', '--auto']).catch(
      (error: unknown) => {
        console.error('Échec du planificateur hebdomadaire :', error);
      }
    );
  };

  runAuto();
  setInterval(runAuto, SCHEDULER_INTERVAL_MS);
}

if (require.main === module) {
  runWeeklySchedule(process.argv)
    .then((summary: ScheduleSummary) => {
      console.log(
        `Terminé : ${summary.moviesAdded} film(s), ${summary.sessionsAdded} séance(s).`
      );
    })
    .catch((error: unknown) => {
      console.error('Échec de la programmation hebdomadaire :', error);
      process.exitCode = 1;
    });
}
