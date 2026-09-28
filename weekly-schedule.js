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
exports.parseArgs = parseArgs;
exports.formatDateString = formatDateString;
exports.addDaysToDateString = addDaysToDateString;
exports.isWednesdayDate = isWednesdayDate;
exports.daysBetweenDateStrings = daysBetweenDateStrings;
exports.timeToMinutes = timeToMinutes;
exports.minutesToTime = minutesToTime;
exports.buildPosterUrl = buildPosterUrl;
exports.getTmdbApiKey = getTmdbApiKey;
exports.isTmdbConfigured = isTmdbConfigured;
exports.getTmdbRegion = getTmdbRegion;
exports.getTmdbLanguage = getTmdbLanguage;
exports.getTmdbMaxNowPlaying = getTmdbMaxNowPlaying;
exports.getTmdbMaxUpcoming = getTmdbMaxUpcoming;
exports.shouldAddMovies = shouldAddMovies;
exports.delayMs = delayMs;
exports.tmdbGet = tmdbGet;
exports.fetchTmdbList = fetchTmdbList;
exports.fetchTmdbDetails = fetchTmdbDetails;
exports.fetchTmdbCastNames = fetchTmdbCastNames;
exports.isValidReleaseDate = isValidReleaseDate;
exports.downloadImageToUploads = downloadImageToUploads;
exports.ensureTmdbColumn = ensureTmdbColumn;
exports.fetchRealMovieEntries = fetchRealMovieEntries;
exports.intervalsOverlap = intervalsOverlap;
exports.fitsWithoutOverlap = fitsWithoutOverlap;
exports.pickNewCatalogMovies = pickNewCatalogMovies;
exports.buildWeekDates = buildWeekDates;
exports.pickAudioTrack = pickAudioTrack;
exports.runWeeklySchedule = runWeeklySchedule;
exports.startWeeklyScheduler = startWeeklyScheduler;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const HALLS = [1, 2];
const OPEN_MINUTES = 11 * 60;
const LAST_START_MINUTES = 22 * 60 + 30;
const LATEST_END_MINUTES = 23 * 60 + 59;
const CLEANING_BUFFER_MINUTES = 30;
const CURSOR_STEP_MINUTES = 15;
const MAX_MOVIE_AGE_DAYS = 30;
const FRESH_MOVIE_DAYS = 14;
const MAX_OLDER_MOVIE_SESSIONS_PER_DAY = 2;
const NEW_MOVIES_PER_WEEK = 2;
const FUTURE_RELEASE_OFFSET_DAYS = 21;
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000;
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TMDB_REQUEST_DELAY_MS = 200;
const CATALOG = [
    {
        title: 'Avengers: Doomsday',
        description: "Les Avengers se reforment face au Docteur Fatalis, une menace capable de briser le multivers. Le destin de tous les univers se joue dans une bataille sans précédent.",
        duration: 170,
        genre: 'Action, Aventure, Science-Fiction',
        actors: 'Robert Downey Jr., Chris Hemsworth, Anthony Mackie',
        posterSeed: 'avengers-doomsday',
    },
    {
        title: 'Dune : Troisieme partie',
        description: "Paul Atreides, devenu Empereur, voit son jihad embraser l'univers connu. Entre visions et trahisons, il devra affronter le prix de son destin.",
        duration: 165,
        genre: 'Science-Fiction, Aventure',
        actors: 'Timothee Chalamet, Zendaya, Florence Pugh',
        posterSeed: 'dune-partie-3',
    },
    {
        title: 'Shrek 5',
        description: "Shrek et Fiona voient leur marécage bousculé par une nouvelle génération d'ogres. Une aventure familiale pleine d'humour les attend au-delà des marais.",
        duration: 100,
        genre: 'Animation, Comedie, Famille',
        actors: 'Mike Myers, Eddie Murphy, Cameron Diaz',
        posterSeed: 'shrek-5',
    },
    {
        title: 'Toy Story 5',
        description: "Woody et Buzz affrontent l'arrivée des jouets connectés. Pour rester les favoris de Bonnie, les jouets devront se réinventer.",
        duration: 105,
        genre: 'Animation, Famille, Comedie',
        actors: 'Tom Hanks, Tim Allen, Joan Cusack',
        posterSeed: 'toy-story-5',
    },
    {
        title: 'Spider-Man: Brand New Day',
        description: "Oublié du monde entier, Peter Parker reprend du service à New York. Un nouveau départ qui le confronte à des ennemis inédits.",
        duration: 145,
        genre: 'Action, Aventure',
        actors: 'Tom Holland, Zendaya, Jacob Batalon',
        posterSeed: 'spiderman-brand-new-day',
    },
    {
        title: 'The Mandalorian & Grogu',
        description: "Din Djarin et Grogu parcourent la galaxie pour une mission cruciale de la Nouvelle République. Le lien entre le Mandalorien et son apprenti sera mis à l'épreuve.",
        duration: 130,
        genre: 'Science-Fiction, Aventure',
        actors: 'Pedro Pascal, Sigourney Weaver',
        posterSeed: 'mandalorian-grogu',
    },
    {
        title: "L'Odyssee",
        description: "Après la guerre de Troie, Ulysse entame un périlleux voyage de retour vers Ithaque. Dieux, monstres et tentations jalonneront sa route.",
        duration: 160,
        genre: 'Aventure, Drame, Histoire',
        actors: 'Matt Damon, Tom Holland, Anne Hathaway',
        posterSeed: 'odyssee-nolan',
    },
    {
        title: 'Super Mario Galaxy : Le Film',
        description: "Mario et Luigi s'envolent vers les galaxies pour sauver la princesse Peach. Une odyssée cosmique pleine de étoiles et de passages secrets.",
        duration: 95,
        genre: 'Animation, Famille, Aventure',
        actors: 'Chris Pratt, Anya Taylor-Joy, Jack Black',
        posterSeed: 'mario-galaxy-film',
    },
    {
        title: 'Hunger Games : Lever de soleil sur la moisson',
        description: "Cinquante ans avant Katniss, le jeune Haymitch est jeté dans l'arène des 50es Hunger Games. Un récit d'origine brutal et émouvant.",
        duration: 150,
        genre: 'Action, Drame, Science-Fiction',
        actors: 'Joseph Zada, Whitney Peak, Jesse Plemons',
        posterSeed: 'hunger-games-moisson',
    },
    {
        title: 'Scream 7',
        description: "Ghostface frappe à nouveau et Sidney Prescott doit sortir de sa retraite. Le tueur masqué n'a jamais été aussi proche.",
        duration: 115,
        genre: 'Horreur, Thriller',
        actors: 'Neve Campbell, Courteney Cox, Mason Gooding',
        posterSeed: 'scream-7',
    },
    {
        title: 'Godzilla x Kong : Supernova',
        description: "Godzilla et Kong unissent leurs forces contre une menace cosmique qui s'abat sur la Terre. Le sort des Titans et des humains est en jeu.",
        duration: 135,
        genre: 'Action, Science-Fiction',
        actors: 'Dan Stevens, Rebecca Hall, Brian Tyree Henry',
        posterSeed: 'godzilla-kong-supernova',
    },
    {
        title: 'Star Wars: Starfighter',
        description: "Cinq ans après l'ascension de Skywalker, un jeune pilote se lance dans une mission désespérée aux confins de la galaxie.",
        duration: 140,
        genre: 'Science-Fiction, Aventure',
        actors: 'Ryan Gosling, Mia Goth, Matt Smith',
        posterSeed: 'star-wars-starfighter',
    },
    {
        title: "L'Age de glace 6",
        description: "Manny, Diego et Sid repartent pour une expédition glaciale. Scrat poursuit toujours son gland à travers les catastrophes.",
        duration: 100,
        genre: 'Animation, Comedie, Famille',
        actors: 'Ray Romano, John Leguizamo, Denis Leary',
        posterSeed: 'age-de-glace-6',
    },
    {
        title: 'Jumanji 4',
        description: "Le jeu maudit aspire une nouvelle fois ses joueurs dans la jungle. Les avatars devront survivre à un niveau plus dangereux que jamais.",
        duration: 125,
        genre: 'Aventure, Comedie',
        actors: 'Dwayne Johnson, Kevin Hart, Karen Gillan',
        posterSeed: 'jumanji-4',
    },
    {
        title: 'Le Diable shabille en Prada 2',
        description: "Miranda Priestly affronte un empire de la mode en pleine mutation. Andy Sachs revient dans un monde du luxe bouleversé par le numérique.",
        duration: 110,
        genre: 'Comedie, Drame',
        actors: 'Meryl Streep, Anne Hathaway, Emily Blunt',
        posterSeed: 'diable-prada-2',
    },
    {
        title: 'Narnia : Le Neveu du magicien',
        description: "Avant l'armoire magique, deux enfants découvrent la naissance du monde de Narnia. La légende des origines enfin portée à l'écran.",
        duration: 150,
        genre: 'Fantastique, Aventure, Famille',
        actors: 'Daniel Craig, Carey Mulligan',
        posterSeed: 'narnia-neveu-magicien',
    },
];
function parseArgs(argv) {
    const args = argv.slice(2);
    const options = {
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
        }
        else if (arg === '--force') {
            options.force = true;
        }
        else if (arg === '--sessions-only') {
            options.sessionsOnly = true;
        }
        else if (arg === '--dry-run') {
            options.dryRun = true;
        }
        else if (arg === '--tmdb') {
            options.tmdb = true;
        }
        else if (arg.startsWith('--db=')) {
            options.dbPath = arg.slice('--db='.length);
        }
        else if (arg.startsWith('--date=')) {
            options.todayOverride = arg.slice('--date='.length);
        }
    }
    return options;
}
function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function addDaysToDateString(dateString, days) {
    const parsed = new Date(`${dateString}T12:00:00`);
    parsed.setDate(parsed.getDate() + days);
    return formatDateString(parsed);
}
function isWednesdayDate(dateString) {
    const parsed = new Date(`${dateString}T12:00:00`);
    return parsed.getDay() === 3;
}
function daysBetweenDateStrings(laterDate, earlierDate) {
    const later = new Date(`${laterDate}T12:00:00`);
    const earlier = new Date(`${earlierDate}T12:00:00`);
    return Math.round((later.getTime() - earlier.getTime()) / 86400000);
}
function timeToMinutes(timeString) {
    const parts = timeString.split(':');
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    return hours * 60 + minutes;
}
function minutesToTime(totalMinutes) {
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minutes = String(totalMinutes % 60).padStart(2, '0');
    return `${hours}:${minutes}`;
}
function buildPosterUrl(posterSeed, wide) {
    if (wide) {
        return `https://picsum.photos/seed/cinema-${posterSeed}-wide/800/450`;
    }
    return `https://picsum.photos/seed/cinema-${posterSeed}/400/600`;
}
function getTmdbApiKey() {
    var _a;
    const apiKey = (_a = process.env.TMDB_API_KEY) !== null && _a !== void 0 ? _a : '';
    return apiKey.trim();
}
function isTmdbConfigured() {
    return getTmdbApiKey().length > 0;
}
function getTmdbRegion() {
    var _a;
    const region = (_a = process.env.TMDB_REGION) !== null && _a !== void 0 ? _a : '';
    return region.trim() !== '' ? region.trim() : 'FR';
}
function getTmdbLanguage() {
    var _a;
    const language = (_a = process.env.TMDB_LANGUAGE) !== null && _a !== void 0 ? _a : '';
    return language.trim() !== '' ? language.trim() : 'fr-FR';
}
function getTmdbMaxNowPlaying() {
    const parsed = Number(process.env.TMDB_MAX_NOW_PLAYING);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 20) {
        return parsed;
    }
    return 8;
}
function getTmdbMaxUpcoming() {
    const parsed = Number(process.env.TMDB_MAX_UPCOMING);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 20) {
        return parsed;
    }
    return 8;
}
function shouldAddMovies(today, options) {
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
function delayMs(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), milliseconds);
    });
}
function tmdbGet(apiPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiKey = getTmdbApiKey();
        if (apiKey === '') {
            throw new Error('TMDB_API_KEY manquant. Ajoutez votre clé TMDB dans le fichier .env.');
        }
        const separator = apiPath.includes('?') ? '&' : '?';
        const url = `${TMDB_API_BASE}${apiPath}${separator}api_key=${encodeURIComponent(apiKey)}`;
        const response = yield fetch(url);
        if (!response.ok) {
            throw new Error(`Appel TMDB échoué (${response.status}) sur ${apiPath}.`);
        }
        const data = (yield response.json());
        return data;
    });
}
function fetchTmdbList(endpoint) {
    return __awaiter(this, void 0, void 0, function* () {
        const region = getTmdbRegion();
        const language = getTmdbLanguage();
        const collected = [];
        for (const page of [1, 2]) {
            const data = yield tmdbGet(`${endpoint}?language=${encodeURIComponent(language)}&region=${encodeURIComponent(region)}&page=${page}`);
            for (const item of data.results) {
                collected.push(item);
            }
            yield delayMs(TMDB_REQUEST_DELAY_MS);
        }
        return collected;
    });
}
function fetchTmdbDetails(tmdbId) {
    return __awaiter(this, void 0, void 0, function* () {
        const language = getTmdbLanguage();
        const details = yield tmdbGet(`/movie/${tmdbId}?language=${encodeURIComponent(language)}`);
        yield delayMs(TMDB_REQUEST_DELAY_MS);
        return details;
    });
}
function fetchTmdbCastNames(tmdbId) {
    return __awaiter(this, void 0, void 0, function* () {
        const credits = yield tmdbGet(`/movie/${tmdbId}/credits`);
        yield delayMs(TMDB_REQUEST_DELAY_MS);
        const names = [];
        for (const member of credits.cast.slice(0, 5)) {
            if (member.name.trim() !== '') {
                names.push(member.name.trim());
            }
        }
        return names.join(', ');
    });
}
function isValidReleaseDate(releaseDate) {
    return /^\d{4}-\d{2}-\d{2}$/.test(releaseDate);
}
function downloadImageToUploads(imageUrl, fileName, dbPath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(imageUrl);
            if (!response.ok) {
                console.log(`Téléchargement image ignoré (${response.status}) : ${imageUrl}`);
                return null;
            }
            const buffer = yield response.arrayBuffer();
            const uploadsDir = path_1.default.resolve(path_1.default.dirname(dbPath), 'uploads');
            const filePath = path_1.default.join(uploadsDir, fileName);
            yield (0, promises_1.writeFile)(filePath, Buffer.from(buffer));
            return `uploads/${fileName}`;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Erreur inconnue';
            console.log(`Téléchargement image échoué (${message}) : ${imageUrl}`);
            return null;
        }
    });
}
function ensureTmdbColumn(db) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield db.exec('ALTER TABLE movies ADD COLUMN tmdb_id INTEGER');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.toLowerCase().includes('duplicate column')) {
                throw error;
            }
        }
    });
}
function getExistingTmdbIds(db) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield db.all('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL');
        const ids = new Set();
        for (const row of rows) {
            if (row.tmdb_id !== null) {
                ids.add(row.tmdb_id);
            }
        }
        return ids;
    });
}
function buildRealEntry(item, dbPath, dryRun) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isValidReleaseDate(item.release_date)) {
            return null;
        }
        const details = yield fetchTmdbDetails(item.id);
        const actors = yield fetchTmdbCastNames(item.id);
        const genres = details.genres.map((genre) => genre.name).join(', ');
        const description = item.overview.trim() !== ''
            ? item.overview.trim()
            : details.overview.trim() !== ''
                ? details.overview.trim()
                : 'Synopsis non disponible pour le moment.';
        const duration = details.runtime !== null && details.runtime > 0 ? details.runtime : 120;
        const stamp = String(Date.now());
        let image = '';
        let wideImage = null;
        if (item.poster_path !== null) {
            const posterUrl = `${TMDB_IMAGE_BASE}/w500${item.poster_path}`;
            if (dryRun) {
                image = posterUrl;
            }
            else {
                const saved = yield downloadImageToUploads(posterUrl, `${stamp}-tmdb-${item.id}-poster.jpg`, dbPath);
                image = saved !== null && saved !== void 0 ? saved : posterUrl;
            }
        }
        if (item.backdrop_path !== null) {
            const backdropUrl = `${TMDB_IMAGE_BASE}/w1280${item.backdrop_path}`;
            if (dryRun) {
                wideImage = backdropUrl;
            }
            else {
                const saved = yield downloadImageToUploads(backdropUrl, `${stamp}-tmdb-${item.id}-wide.jpg`, dbPath);
                wideImage = saved !== null && saved !== void 0 ? saved : backdropUrl;
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
    });
}
function fetchRealMovieEntries(weekEnd, dbPath, dryRun, existingTitles, existingTmdbIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const maxNowPlaying = getTmdbMaxNowPlaying();
        const maxUpcoming = getTmdbMaxUpcoming();
        const nowPlaying = yield fetchTmdbList('/movie/now_playing');
        const upcoming = yield fetchTmdbList('/movie/upcoming');
        const entries = [];
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
            const entry = yield buildRealEntry(item, dbPath, dryRun);
            if (entry !== null) {
                entries.push(entry);
                existingTmdbIds.add(item.id);
            }
        }
        let upcomingAdded = 0;
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
            const entry = yield buildRealEntry(item, dbPath, dryRun);
            if (entry !== null) {
                entries.push(entry);
                existingTmdbIds.add(item.id);
                upcomingAdded += 1;
            }
        }
        return entries;
    });
}
function intervalsOverlap(firstStart, firstEnd, secondStart, secondEnd) {
    return firstStart < secondEnd && secondStart < firstEnd;
}
function fitsWithoutOverlap(blocked, start, end) {
    for (const interval of blocked) {
        if (intervalsOverlap(start, end, interval.start, interval.end)) {
            return false;
        }
    }
    return true;
}
function openDb(dbPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield (0, sqlite_1.open)({
            filename: dbPath,
            driver: sqlite3_1.default.Database,
        });
        return db;
    });
}
function getExistingTitles(db) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield db.all('SELECT title FROM movies');
        const titles = new Set();
        for (const row of rows) {
            titles.add(row.title.trim().toLowerCase());
        }
        return titles;
    });
}
function pickNewCatalogMovies(existingTitles, count) {
    const picked = [];
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
function getAllMovies(db) {
    return __awaiter(this, void 0, void 0, function* () {
        const movies = yield db.all('SELECT * FROM movies');
        return movies;
    });
}
function buildVirtualMovie(entry, index) {
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
function catalogEntriesForWeek(picked, today) {
    const farRelease = addDaysToDateString(today, FUTURE_RELEASE_OFFSET_DAYS);
    const entries = [];
    for (let index = 0; index < picked.length; index++) {
        const movie = picked[index];
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
function insertMovieEntries(db, entries, dryRun, summary) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const entry of entries) {
            if (!dryRun) {
                yield db.run('INSERT INTO movies (title, description, duration, genre, actors, release_date, transfer_link, image, wide_image, tmdb_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
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
                ]);
            }
            summary.moviesAdded += 1;
            summary.addedTitles.push(`${entry.movie.title} (${entry.releaseDate})`);
        }
        if (entries.length === 0) {
            console.log('Aucun nouveau film à ajouter (catalogue épuisé ou déjà en base).');
        }
    });
}
function resolveWeeklyEntries(db, today, weekEnd, dbPath, dryRun, useTmdb) {
    return __awaiter(this, void 0, void 0, function* () {
        const existingTitles = yield getExistingTitles(db);
        if (useTmdb) {
            const existingTmdbIds = yield getExistingTmdbIds(db);
            return fetchRealMovieEntries(weekEnd, dbPath, dryRun, existingTitles, existingTmdbIds);
        }
        const picked = pickNewCatalogMovies(existingTitles, NEW_MOVIES_PER_WEEK);
        return catalogEntriesForWeek(picked, today);
    });
}
function appendVirtualMovies(movies, entries) {
    for (let index = 0; index < entries.length; index++) {
        movies.push(buildVirtualMovie(entries[index], movies.length + index));
    }
}
function selectEligibleMovies(movies, weekEnd, cutoff) {
    const eligible = movies.filter((movie) => movie.release_date <= weekEnd && movie.release_date >= cutoff);
    eligible.sort((left, right) => right.release_date.localeCompare(left.release_date));
    return eligible;
}
function getSessionsInWindow(db, weekStart, weekEnd) {
    return __awaiter(this, void 0, void 0, function* () {
        const sessions = yield db.all('SELECT * FROM sessions WHERE date >= ? AND date <= ?', [weekStart, weekEnd]);
        return sessions;
    });
}
function buildWeekDates(weekStart) {
    const dates = [];
    for (let offset = 0; offset < 7; offset++) {
        dates.push(addDaysToDateString(weekStart, offset));
    }
    return dates;
}
function pickAudioTrack(slotIndex) {
    const useEnglish = slotIndex % 4 === 3;
    if (useEnglish) {
        return { audio: 'English', subtitle: 'French' };
    }
    return { audio: 'French', subtitle: null };
}
function planDayForHall(date, hallNo, candidates, blocked, startPointer) {
    var _a, _b;
    const planned = [];
    const sessionsPerMovie = new Map();
    let pointer = startPointer % Math.max(candidates.length, 1);
    let cursor = OPEN_MINUTES;
    let guard = 0;
    let slotIndex = 0;
    while (cursor <= LAST_START_MINUTES && guard < 300) {
        guard += 1;
        let placed = false;
        for (let step = 0; step < candidates.length; step++) {
            const candidate = candidates[(pointer + step) % candidates.length];
            if (candidate.release_date > date) {
                continue;
            }
            const ageDays = daysBetweenDateStrings(date, candidate.release_date);
            if (ageDays > MAX_MOVIE_AGE_DAYS) {
                continue;
            }
            if (ageDays > FRESH_MOVIE_DAYS &&
                ((_a = sessionsPerMovie.get(candidate.id)) !== null && _a !== void 0 ? _a : 0) >= MAX_OLDER_MOVIE_SESSIONS_PER_DAY) {
                continue;
            }
            const endMinutes = cursor + candidate.duration;
            if (endMinutes > LATEST_END_MINUTES) {
                continue;
            }
            const busyEnd = endMinutes + CLEANING_BUFFER_MINUTES;
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
            sessionsPerMovie.set(candidate.id, ((_b = sessionsPerMovie.get(candidate.id)) !== null && _b !== void 0 ? _b : 0) + 1);
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
function runWeeklySchedule() {
    return __awaiter(this, arguments, void 0, function* (argv = process.argv) {
        var _a, _b, _c;
        const options = parseArgs(argv);
        const now = new Date();
        const today = options.todayOverride.trim() !== '' ? options.todayOverride.trim() : formatDateString(now);
        const weekStart = today;
        const weekEnd = addDaysToDateString(today, 6);
        const cutoff = addDaysToDateString(today, -MAX_MOVIE_AGE_DAYS);
        const summary = {
            today,
            weekStart,
            weekEnd,
            moviesAdded: 0,
            sessionsAdded: 0,
            sessionsSkipped: 0,
            addedTitles: [],
        };
        const db = yield openDb(options.dbPath);
        try {
            yield ensureTmdbColumn(db);
            const weeklyDropDue = shouldAddMovies(today, options);
            let dropEntries = [];
            if (weeklyDropDue) {
                dropEntries = yield resolveWeeklyEntries(db, today, weekEnd, options.dbPath, options.dryRun, options.tmdb);
                yield insertMovieEntries(db, dropEntries, options.dryRun, summary);
                if (options.tmdb) {
                    console.log(`Synchronisation TMDB : ${dropEntries.length} film(s) réel(s) ajouté(s).`);
                }
            }
            else {
                console.log('Ajout de films ignoré (hors mercredi ou mode séances uniquement).');
            }
            let movies = yield getAllMovies(db);
            if (options.dryRun && weeklyDropDue) {
                appendVirtualMovies(movies, dropEntries);
            }
            let eligible = selectEligibleMovies(movies, weekEnd, cutoff);
            if (eligible.length === 0 && movies.length > 0 && !options.sessionsOnly) {
                console.log('Aucun film récent : ajout de rattrapage pour éviter un site vide.');
                const healWithTmdb = !options.force && isTmdbConfigured();
                const entries = yield resolveWeeklyEntries(db, today, weekEnd, options.dbPath, options.dryRun, healWithTmdb);
                yield insertMovieEntries(db, entries, options.dryRun, summary);
                if (options.dryRun) {
                    appendVirtualMovies(movies, entries);
                }
                else {
                    movies = yield getAllMovies(db);
                }
                eligible = selectEligibleMovies(movies, weekEnd, cutoff);
            }
            if (eligible.length === 0) {
                console.log('Aucun film de moins de 30 jours : aucune séance planifiée.');
                yield db.close();
                return summary;
            }
            const durationsByMovie = new Map();
            for (const movie of movies) {
                durationsByMovie.set(movie.id, movie.duration);
            }
            const existingSessions = yield getSessionsInWindow(db, weekStart, weekEnd);
            const blockedByHallDay = new Map();
            for (const session of existingSessions) {
                const duration = (_a = durationsByMovie.get(session.movie_id)) !== null && _a !== void 0 ? _a : 120;
                const start = timeToMinutes(session.time);
                const key = `${session.hall_no}|${session.date}`;
                const blocked = (_b = blockedByHallDay.get(key)) !== null && _b !== void 0 ? _b : [];
                blocked.push({ start, end: start + duration + CLEANING_BUFFER_MINUTES });
                blockedByHallDay.set(key, blocked);
            }
            const weekDates = buildWeekDates(weekStart);
            const plannedSessions = [];
            let pointer = 0;
            for (const date of weekDates) {
                const releasedForDay = eligible.filter((movie) => movie.release_date <= date);
                if (releasedForDay.length === 0) {
                    continue;
                }
                const dayCandidates = releasedForDay;
                for (const hallNo of HALLS) {
                    const key = `${hallNo}|${date}`;
                    const blocked = (_c = blockedByHallDay.get(key)) !== null && _c !== void 0 ? _c : [];
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
                        yield db.run('INSERT INTO sessions (movie_id, audio, subtitle, hall_no, date, time) VALUES (?, ?, ?, ?, ?, ?)', [
                            planned.movie_id,
                            planned.audio,
                            planned.subtitle,
                            planned.hall_no,
                            planned.date,
                            planned.time,
                        ]);
                        summary.sessionsAdded += 1;
                    }
                    catch (error) {
                        summary.sessionsSkipped += 1;
                    }
                }
            }
            else {
                summary.sessionsAdded = plannedSessions.length;
            }
            console.log(`Semaine ${weekStart} -> ${weekEnd} : ${summary.moviesAdded} film(s), ${summary.sessionsAdded} séance(s) planifiée(s), ${summary.sessionsSkipped} ignorée(s).`);
            if (summary.addedTitles.length > 0) {
                console.log(`Nouveautés : ${summary.addedTitles.join(' | ')}`);
            }
            yield db.close();
            return summary;
        }
        catch (error) {
            yield db.close();
            throw error;
        }
    });
}
function startWeeklyScheduler() {
    const disabled = process.env.DISABLE_WEEKLY_SCHEDULER === '1';
    if (disabled) {
        console.log('Planificateur hebdomadaire désactivé (DISABLE_WEEKLY_SCHEDULER=1).');
        return;
    }
    const runAuto = () => {
        runWeeklySchedule(['node', 'weekly-schedule', '--auto']).catch((error) => {
            console.error('Échec du planificateur hebdomadaire :', error);
        });
    };
    runAuto();
    setInterval(runAuto, SCHEDULER_INTERVAL_MS);
}
if (require.main === module) {
    runWeeklySchedule(process.argv)
        .then((summary) => {
        console.log(`Terminé : ${summary.moviesAdded} film(s), ${summary.sessionsAdded} séance(s).`);
    })
        .catch((error) => {
        console.error('Échec de la programmation hebdomadaire :', error);
        process.exitCode = 1;
    });
}
