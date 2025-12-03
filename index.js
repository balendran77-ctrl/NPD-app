// ...existing code...
// ...existing code...
// Email and cron setup for daily updates
const sgMail = require('@sendgrid/mail');
const cron = require('node-cron');

// Email configuration (SendGrid uses API key instead of SMTP)
const EMAIL_FROM = 'rpplhosur@gmail.com';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const RECIPIENTS = [
    'bala@bharathpackagings.com',
    'rppl@bharathpackagings.com',
    'marketing@bharathpackagings.com',
    'naveen@bharathpackagings.com'
];

// Initialize SendGrid
if (SENDGRID_API_KEY) {
	sgMail.setApiKey(SENDGRID_API_KEY);
}

// Function to get yesterday's updates and send email
async function sendDailyUpdatesEmail() {
	if (!SENDGRID_API_KEY) {
		console.warn('SENDGRID_API_KEY not set; skipping daily updates email.');
		return;
	}
	console.log('[DailyEmail] Preparing report for previous day at', new Date().toISOString());
	const now = new Date();
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	yesterday.setHours(0, 0, 0, 0);
	const endOfYesterday = new Date(yesterday);
	endOfYesterday.setHours(23, 59, 59, 999);

	// Fetch products updated yesterday
	const products = await Product.find({
		updatedAt: { $gte: yesterday, $lte: endOfYesterday }
	}).sort({ updatedAt: -1 }).lean();

	// Prepare compact summary counts
	const total = products.length;
	const byStatus = products.reduce((acc, p) => {
		const s = (p.approvalStatus || 'Pending').trim();
		acc[s] = (acc[s] || 0) + 1;
		return acc;
	}, {});

	// Build HTML report
	let html = `<h2>Daily Updates Report for ${yesterday.toISOString().slice(0,10)}</h2>`;
	html += `<p>Total updates: ${total}. ` + Object.entries(byStatus).map(([k,v]) => `${k}: ${v}`).join(', ') + `</p>`;
	if (products.length === 0) {
		html += '<p>No updates found for yesterday.</p>';
	} else {
		html += '<table border="1" cellpadding="5" cellspacing="0"><tr><th>Product Name</th><th>Customer Name</th><th>Status</th><th>Updated At</th></tr>';
		products.forEach(p => {
			html += `<tr><td>${p.productName || ''}</td><td>${p.customerName || ''}</td><td>${p.approvalStatus || ''}</td><td>${p.updatedAt ? new Date(p.updatedAt).toLocaleString() : ''}</td></tr>`;
		});
		html += '</table>';
	}

	// Build XLSX attachment
	const XLSX = require('xlsx');
	const data = products.map((p, idx) => ({
		'Sl. No': idx + 1,
		'Product Name': p.productName || '',
		'Customer Name': p.customerName || '',
		'Approval Status': p.approvalStatus || '',
		'Updated At': p.updatedAt ? new Date(p.updatedAt).toISOString() : ''
	}));
	const ws = XLSX.utils.json_to_sheet(data);
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Daily Updates');
	const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

	// Staggered sends: send one-by-one with small delay
	for (const recipient of RECIPIENTS) {
		const msg = {
			to: recipient,
			bcc: EMAIL_FROM,
			from: EMAIL_FROM,
			subject: `Daily Updates Report - ${yesterday.toISOString().slice(0,10)}`,
			text: `Daily Updates Report for ${yesterday.toISOString().slice(0,10)}\nTotal: ${total}. ` + Object.entries(byStatus).map(([k,v]) => `${k}: ${v}`).join(', '),
			html,
			attachments: [
				{
					content: xlsxBuf.toString('base64'),
					filename: `daily-updates-${yesterday.toISOString().slice(0,10)}.xlsx`,
					type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					content_id: 'daily_updates_xlsx',
					Disposition: 'attachment'
				}
			],
			mailSettings: { sandboxMode: { enable: false } }
		};
		await sgMail.send(msg);
		console.log(`[DailyEmail] Sent to ${recipient}`);
		await new Promise(r => setTimeout(r, 7000)); // 7s delay
	}
	console.log('[DailyEmail] Sent daily updates email to', RECIPIENTS.join(', '));
}

// Schedule job at 6 am every day
console.log('[DailyEmail] Scheduling cron job 0 6 * * * with timezone Asia/Kolkata');
cron.schedule('0 6 * * *', () => {
	console.log('[DailyEmail] Cron trigger at', new Date().toISOString());
	sendDailyUpdatesEmail().catch(err => console.error('Error sending daily updates email:', err));
}, { timezone: 'Asia/Kolkata' });

// Admin: manually run daily email now
// Note: route must be registered after `app` initialization below.
// ...existing code...
// Place admin user management routes after app initialization
// ...existing code...
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');

const app = express();

// NOTE: AI settings routes are mounted later after session middleware so req.session is available.

// Helper to get current AI model (can be used by other modules)
function getCurrentAiModel() {
	if (process.env.ENABLE_GPT5_MINI === 'true') return 'gpt-5-mini';
	return process.env.AI_MODEL || 'gpt-4o';
}

// expose to app locals for views or modules
app.locals.getCurrentAiModel = getCurrentAiModel;

// Multer setup for file uploads with original filename
const multer = require('multer');
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, path.join(__dirname, 'uploads'));
	},
	filename: function (req, file, cb) {
		// Use Date.now() to avoid collisions, preserve original extension
		const ext = path.extname(file.originalname);
		cb(null, file.fieldname + '-' + Date.now() + ext);
	}
});
const upload = multer({ storage });

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection string must be provided via environment variable for security.
// Remove any hard-coded connection strings and set MONGO_URI in your hosting env.
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
	console.error('FATAL: MONGO_URI environment variable is required. Set it to your MongoDB connection string.');
	process.exit(1);
}
console.log('Using MongoDB URI from environment (MONGO_URI)');
// Start the server only after successful DB connection to avoid race conditions
mongoose.connect(mongoUri)
	.then(() => {
		// DB connected, start server with port fallback
		const startServer = (port, attemptsLeft = 5) => {
			// Bind to 0.0.0.0 so hosted platforms (Render, Heroku, etc.) can reach the process
			// and their health checks detect the open port. Binding to 127.0.0.1 prevents
			// external health checks from reaching the process in those environments.
			const host = '0.0.0.0';
			console.log('Binding server to host:', host, 'port:', port);
			const server = app.listen(port, host, () => {
				console.log(`Server running on http://${host}:${port}`);
			});

			server.on('error', (err) => {
				if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
					console.error(`Port ${port} is in use, trying ${port + 1}...`);
					// try next port after a short delay
					setTimeout(() => startServer(port + 1, attemptsLeft - 1), 200);
				} else {
					console.error('Server error:', err);
					process.exit(1);
				}
			});
		};

		const initialPort = parseInt(process.env.PORT, 10) || 3000;
		startServer(initialPort);
	})
	.catch(err => {
		// Log connection error and exit - use console.error so it's visible in logs
		console.error('MongoDB connection error:', err);
		process.exit(1);
	});
// Middleware
// If running behind a proxy (Render, Heroku, etc.) we must trust the proxy
// so that express-session knows the original request was secure and can set
// secure cookies. Set to 1 to trust the first proxy in the chain.
if (process.env.NODE_ENV === 'production') {
	app.set('trust proxy', 1);
}
// Configure session store. Prefer a persistent store (connect-mongo) in production.
let MongoStore;
try {
	MongoStore = require('connect-mongo');
} catch (err) {
	MongoStore = null;
}

const sessionOptions = {
	secret: process.env.SESSION_SECRET || 'your_secret',
	resave: false,
	saveUninitialized: false,
	cookie: {
		// secure should be true when serving over HTTPS. With a proxy (Render)
		// set app.set('trust proxy', 1) above so this works correctly.
		secure: process.env.NODE_ENV === 'production',
	// Do not set maxAge: leaving cookie as a session cookie means it will be
	// cleared when the browser (or tab) is closed. This matches the user's
	// expectation that closing the session/browser logs them out.
	// Lax protects against CSRF while allowing top-level GET navigations
	sameSite: 'lax'
	}
};

if (MongoStore) {
	sessionOptions.store = MongoStore.create({ mongoUrl: mongoUri });
} else {
	console.warn('\nWarning: connect-mongo not installed. Using default MemoryStore.');
	console.warn('The default MemoryStore is not designed for production and may leak memory.');
	console.warn('Install a production store (e.g. npm i connect-mongo) and restart to remove this warning.\n');
}

app.use(bodyParser.urlencoded({ extended: false }));
app.use(session(sessionOptions));
console.log('Session store:', MongoStore ? 'connect-mongo (MongoDB)' : 'MemoryStore (in-memory)');
console.log('NODE_ENV=', process.env.NODE_ENV || 'development');
// Mount AI settings routes (admin UI) after session middleware so req.session is available
try {
	const aiRoutes = require('./routes/ai-settings');
	app.use(aiRoutes);
} catch (err) {
	// non-critical if file missing in some environments
}
// Serve static assets (CSS, client JS, images)
app.use(express.static(path.join(__dirname, 'public')));
// Make the logged-in user available in all views via res.locals
app.use((req, res, next) => {
	res.locals.user = req.session.user || null;
	next();
});
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// User Schema
const userSchema = new mongoose.Schema({
	username: String,
	password: String,
	isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

// Home page
// Home page - require login to see the authenticated home UI. Unauthenticated
// visitors are redirected to /login so they see the login screen in hosted envs.
// Simple in-memory cache for dashboard aggregation results
const dashboardCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes

app.get('/', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');

	try {
		// allow range option via ?range=7|30|90
		const allowed = [7,30,90];
		let range = parseInt(req.query.range, 10);
		if (!allowed.includes(range)) range = 30;
		const days = range;

		const end = new Date();
		end.setHours(23,59,59,999);
		const start = new Date();
		start.setHours(0,0,0,0);
		start.setDate(start.getDate() - (days - 1));

		// Cache key based on start/end
		const cacheKey = `dashboard:${days}:${start.toISOString().slice(0,10)}:${end.toISOString().slice(0,10)}`;
		const cached = dashboardCache.get(cacheKey);
		if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
			return res.render('index', { user: req.session.user, dashboard: cached.data, range });
		}

		// Build aggregation that counts total requests per createdAtDate (Sample request given)
		// and separately counts specific status categories using conditional sums.
		const pipeline = [
			{ $match: { createdAt: { $gte: start, $lte: end } } },
			// include requiredDate so we can determine on-time deliveries
			{ $project: { createdAtDate: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, deliveredDate: 1, approvalStatus: 1, requiredDate: 1 } },
			{ $group: {
				_id: '$createdAtDate',
				totalRequests: { $sum: 1 },
				submittedForApproval: { $sum: { $cond: [ { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $or: [ { $eq: ["$approvalStatus", null] }, { $eq: ["$approvalStatus", ""] } ] } ] }, 1, 0 ] } },
				approved: { $sum: { $cond: [ { $eq: ["$approvalStatus", 'Approved'] }, 1, 0 ] } },
				resample: { $sum: { $cond: [ { $eq: ["$approvalStatus", 'Resample'] }, 1, 0 ] } },
				rejected: { $sum: { $cond: [ { $eq: ["$approvalStatus", 'Rejected'] }, 1, 0 ] } },
				hold: { $sum: { $cond: [ { $regexMatch: { input: "$approvalStatus", regex: "hold", options: "i" } }, 1, 0 ] } },
				cancelled: { $sum: { $cond: [ { $regexMatch: { input: "$approvalStatus", regex: "^cancel", options: "i" } }, 1, 0 ] } },
				// on-time: deliveredDate present AND requiredDate present AND deliveredDate <= requiredDate
				ontime: { $sum: { $cond: [ { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $lte: ["$deliveredDate", "$requiredDate"] } ] }, 1, 0 ] } },
				delayed: { $sum: { $cond: [ { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $gt: ["$deliveredDate", "$requiredDate"] } ] }, 1, 0 ] } }
			} },
			{ $project: {
				date: '$_id',
				counts: {
					'Sample request given': '$totalRequests',
					'Sample submitted for Approval': '$submittedForApproval',
					'Sample approved': '$approved',
					'Resample': '$resample',
					'Sample rejected': '$rejected',
					'HOLD': '$hold',
					'Cancelled': '$cancelled',
					'Ontime': '$ontime',
					'Delayed': '$delayed'
				},
				_id: 0
			} },
			{ $sort: { date: 1 } }
		];

		const rows = await Product.aggregate(pipeline).allowDiskUse(true).exec();

		const labels = [];
		const labelMap = {};
		for (let i = 0; i < days; i++) {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			const s = d.toISOString().slice(0,10);
			labels.push(s);
			labelMap[s] = {};
		}

		const categories = ['Sample request given','Sample to be submitted','Sample submitted for Approval','Sample approved','Resample','Sample rejected','HOLD','Cancelled'];
		labels.forEach(date => { categories.forEach(c => { labelMap[date][c] = 0; }); });
		rows.forEach(r => {
			const date = r.date;
			const counts = r.counts || {};
			if (!labelMap[date]) return;
			Object.keys(counts).forEach(k => { labelMap[date][k] = counts[k]; });
		});

		// Compute 'Sample to be submitted' = totalRequests - (submitted + approved + resample + hold + cancelled)
		labels.forEach(date => {
			const total = labelMap[date]['Sample request given'] || 0;
			const submitted = labelMap[date]['Sample submitted for Approval'] || 0;
			const approved = labelMap[date]['Sample approved'] || 0;
			const resmp = labelMap[date]['Resample'] || 0;
			const hold = labelMap[date]['HOLD'] || 0;
			const cancelled = labelMap[date]['Cancelled'] || 0;
			const toBe = total - (submitted + approved + resmp + hold + cancelled);
			labelMap[date]['Sample to be submitted'] = toBe > 0 ? toBe : 0;
		});

	const datasets = categories.map((cat, idx) => ({ label: cat, data: labels.map(d => labelMap[d][cat] || 0) }));
	const totals = {};
	categories.forEach((cat, idx) => { totals[cat] = datasets[idx].data.reduce((a,b) => a+b, 0); });
	// Compute on-time and delayed totals and percentages for the selected period
	const onTimeTotal = labels.reduce((sum, d) => sum + (labelMap[d]['Ontime'] || 0), 0);
	const delayedTotal = labels.reduce((sum, d) => sum + (labelMap[d]['Delayed'] || 0), 0);
	const totalRequestsSum = totals['Sample request given'] || 0;
	const ontimePercent = totalRequestsSum > 0 ? Math.round((onTimeTotal / totalRequestsSum) * 10000) / 100 : 0; // 2 decimals
	const delayedPercent = totalRequestsSum > 0 ? Math.round((delayedTotal / totalRequestsSum) * 10000) / 100 : 0; // 2 decimals
	totals['Ontime %'] = ontimePercent;
	totals['Delayed %'] = delayedPercent;

	// Total Sampling Costs KPI for the selected period
	try {
		const costAgg = await Product.aggregate([
			{ $match: { createdAt: { $gte: start, $lte: end } } },
			{ $group: { _id: null, totalCost: { $sum: { $ifNull: [ '$sampleCosts.totalSampleCost', 0 ] } } } }
		]);
		const samplingTotal = costAgg.length ? costAgg[0].totalCost : 0;
		totals['Total Sampling Costs'] = Math.round((samplingTotal + Number.EPSILON) * 100) / 100;
	} catch(costErr) {
		console.warn('Sampling cost aggregation failed:', costErr.message);
	}

	const dashboard = { labels, datasets, totals };

	// Aggregate approved order metrics for the same period (based on createdAt range for consistency)
	try {
		const approvedAgg = await Product.aggregate([
			{ $match: { createdAt: { $gte: start, $lte: end }, approvalStatus: 'Approved' } },
			{ $group: { _id: null, qty: { $sum: { $ifNull: [ '$orderQuantity', 0 ] } }, val: { $sum: { $ifNull: [ '$orderValue', 0 ] } } } }
		]);
		const qtyTotal = approvedAgg.length ? approvedAgg[0].qty : 0;
		const valTotal = approvedAgg.length ? approvedAgg[0].val : 0;
		// Add KPI cards
		totals['Order Quantity'] = qtyTotal;
		totals['Order Value'] = Math.round((valTotal + Number.EPSILON) * 100) / 100; // 2 decimals
	} catch(orderErr) {
		console.warn('Order KPI aggregation failed:', orderErr.message);
	}

		dashboardCache.set(cacheKey, { ts: Date.now(), data: dashboard });
		res.render('index', { user: req.session.user, dashboard, range });
	} catch (err) {
		console.error('Error preparing dashboard:', err && err.stack ? err.stack : err);
		// Render a safe fallback: ensure `range` is always provided so the EJS
		// template doesn't throw a ReferenceError when it references `range`.
		res.render('index', { user: req.session.user, dashboard: null, range: 30 });
	}
});

// Debug endpoint: return current session info (useful when testing on Render)
app.get('/whoami', (req, res) => {
	res.json({
		sessionId: req.sessionID || null,
		user: req.session && req.session.user ? req.session.user : null,
		cookies: req.headers.cookie || null
	});
});

// Register
// Only allow admin to access registration
function isAdmin(req) {
	return req.session.user && req.session.user.isAdmin;
}

app.get('/register', (req, res) => {
	if (!isAdmin(req)) return res.status(403).send('Forbidden: Admins only');
	res.render('register');
});
app.post('/register', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).send('Forbidden: Admins only');
	const { username, password } = req.body;
	const hash = await bcrypt.hash(password, 10);
	const user = new User({ username, password: hash });
	await user.save();
	res.redirect('/login');
});

// Login
app.get('/login', (req, res) => {
	res.render('login');
});
app.post('/login', async (req, res) => {
	const { username, password } = req.body;
	const user = await User.findOne({ username });
	if (user && await bcrypt.compare(password, user.password)) {
		req.session.user = {
			_id: user._id,
			username: user.username,
			isAdmin: !!user.isAdmin // ensure boolean
		};
		// Save the session before redirecting to ensure the cookie and session store are persisted
		req.session.save(err => {
			if (err) {
				console.error('Session save error:', err);
			}
			res.redirect('/');
		});
	} else {
		res.render('login', { error: 'Invalid credentials' });
	}
});

// Logout
app.get('/logout', (req, res) => {
	req.session.destroy();
	res.redirect('/');
});

// Report page
app.get('/report', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const { fromDate = '', toDate = '', status = '', dateField = '' } = req.query;
	let filter = {};

	// When dateField=createdAt is provided (dashboard links), apply createdAt filter.
	if (fromDate && toDate) {
		if (dateField === 'createdAt') {
			const from = new Date(fromDate);
			const to = new Date(toDate);
			to.setHours(23,59,59,999);
			filter.createdAt = { $gte: from, $lte: to };
		} else {
			// Default behavior: filter by requiredDate (existing behaviour)
			filter.requiredDate = { $gte: fromDate, $lte: toDate };
		}
	}

	// Filter by status
	if (status) {
		if (status === 'Sample request given') {
			// dashboard 'Sample request given' is total requests for the period -> no extra filter
		} else if (status === 'Sample to be submitted') {
			// Not yet submitted: deliveredDate empty and no approval status
			filter.deliveredDate = { $in: [null, ''] };
			filter.approvalStatus = { $in: [null, '', undefined] };
		} else if (status === 'Sample submitted for Approval') {
			filter.deliveredDate = { $ne: null };
			filter.approvalStatus = { $in: [null, '', undefined] };
		} else if (status === 'Sample approved') {
			filter.approvalStatus = 'Approved';
		} else if (status === 'Sample rejected') {
			filter.approvalStatus = 'Rejected';
		} else if (status === 'Resample') {
			filter.approvalStatus = 'Resample';
		} else if (status === 'Ontime') {
			// deliveredDate and requiredDate present and deliveredDate <= requiredDate
			filter.$expr = { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $lte: ["$deliveredDate", "$requiredDate"] } ] };
		} else if (status === 'Delayed') {
			// deliveredDate and requiredDate present and deliveredDate > requiredDate
			filter.$expr = { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $gt: ["$deliveredDate", "$requiredDate"] } ] };
		} else if (status === 'HOLD') {
			filter.approvalStatus = { $regex: '^HOLD', $options: 'i' };
		} else if (status === 'Cancelled') {
			filter.approvalStatus = { $regex: '^cancel', $options: 'i' };
		} else if (status === 'HOLD by customer') {
			filter.approvalStatus = 'HOLD by customer';
		} else if (status === 'Hold by Marketing team') {
			filter.approvalStatus = 'Hold by Marketing team';
		}
	}

	const products = await Product.find(filter).lean();
	res.render('report', { products, fromDate, toDate, status, dateField });
});

// Product Schema
// Enable timestamps so Mongoose adds `createdAt` (request received date) and `updatedAt` automatically.
// `createdAt` can be used as the request received date.
const productSchema = new mongoose.Schema({
	personName: String,
	customerName: String,
	productName: String,
	specifications: {
		ply: String,
		fluteType: String,
		length: String,
		width: String,
		height: String,
		unitOfMeasurement: String,
		burstingStrength: String,
		BCT: String,
		ECT: String,
		FCT: String,
		moisture: String,
		weight: String
	},
	printing: new mongoose.Schema({
		noOfColors: String,
		type: String,
		colors: String
	}, { _id: false }),
	sampleType: { type: String, required: true }, // FAI, Size and spec, only size
	noOfSamples: { type: String, required: true },
	requiredDate: { type: String, required: true },
	deliveryAddress: { type: String, required: true },
	customerContact: { type: String, required: true },
	contactNo: { type: String, required: true },
	createdBy: String,
	deliveredDate: String,
	dcDetails: String,
	courierDetails: String,
	approvedDate: String,
	approvalStatus: String, // Approved, Rejected, Resample
	rejectionReason: String,
	drawingPath: String, // File path for drawing/photo
	// Order metrics (captured when status becomes Approved)
	orderQuantity: Number,
	orderValue: Number,
	// Sampling cost breakdown and total
	sampleCosts: {
		stereoCost: { type: Number, default: 0 },
		dieCost: { type: Number, default: 0 },
		boardCost: { type: Number, default: 0 },
		printingCost: { type: Number, default: 0 },
		manhourCost: { type: Number, default: 0 },
		courierCost: { type: Number, default: 0 },
		totalSampleCost: { type: Number, default: 0 }
	},
	statusUpdates: [{
		date: String,
		status: String,
		details: String
	}],
	// Order Data Sheet - ply-based layer structure
	orderDataSheet: {
		reelSize: String,
		cuttingSize: String,
		dieNo: String,
		dieCuttingBoardReelSize: String,
		dieCuttingBoardCuttingSize: String,
		layers: [{
			name: String, // Top, Flute 1, Packing 1, Flute 2, Packing 2
			gsm: String,
			bf: String,
			shade: String,
			mill: String,
			fluteType: String // B, C, E (only for Flute rows)
		}],
		processes: [{
			name: String, // Corrugation, Printer slotter, Die cutter, etc.
			machine: String,
			ups: String,
			joints: String
		}]
	}
}, { timestamps: true });
const Product = mongoose.model('Product', productSchema);

// Add Product
app.get('/add-product', (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	Product.countDocuments().then(count => {
		res.render('add-product', { nextSlNo: count + 1 });
	});
});
app.post('/add-product', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const product = new Product({
		personName: req.body.personName,
		customerName: req.body.customerName,
		productName: req.body.productName,
		specifications: {
			ply: req.body.ply,
			fluteType: req.body.fluteType,
			length: req.body.length,
			width: req.body.width,
			height: req.body.height,
			unitOfMeasurement: req.body.unitOfMeasurement,
			burstingStrength: req.body.burstingStrength,
			BCT: req.body.BCT,
			ECT: req.body.ECT,
			FCT: req.body.FCT,
			moisture: req.body.moisture,
			weight: req.body.weight
		},
		printing: {
			noOfColors: req.body.noOfColors,
			type: req.body.printingType,
			colors: req.body.colorsToBePrinted
		},
		sampleType: req.body.sampleType,
		noOfSamples: req.body.noOfSamples,
		requiredDate: req.body.requiredDate,
		deliveryAddress: req.body.deliveryAddress,
		customerContact: req.body.customerContact,
		contactNo: req.body.contactNo,
		createdBy: req.session.user.username,
		deliveredDate: '',
		approvedDate: '',
		approvalStatus: '',
		rejectionReason: ''
	});
	await product.save();
	res.redirect('/products');
});

// List Products
app.get('/products', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const products = await Product.find();
	res.render('products', { products });
});

// Route to show searchable product list for editing specifications
app.get('/edit-specifications', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const { q = '', fromDate = '', toDate = '' } = req.query;
	let filter = {};
	if (q && q.trim() !== '') {
		const regex = new RegExp(q.trim(), 'i');
		filter.$or = [ { productName: regex }, { customerName: regex } ];
	}
	if (fromDate && toDate) {
		// Use createdAt (request received date) for filtering
		const from = new Date(fromDate);
		const to = new Date(toDate);
		// include the entire to-day by setting time to 23:59:59
		to.setHours(23,59,59,999);
		filter.createdAt = { $gte: from, $lte: to };
	}
	const products = await Product.find(filter).lean();
	res.render('select-product', { products, q, fromDate, toDate });
});

// Quick update list: a simplified product list with direct links to update delivery/approval
app.get('/quick-update', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const { q = '', fromDate = '', toDate = '' } = req.query; // search query and dates
	let filter = {};
	if (q && q.trim() !== '') {
		const regex = new RegExp(q.trim(), 'i');
		filter.$or = [
			{ customerName: regex },
			{ productName: regex }
		];
	}
	if (fromDate && toDate) {
		const from = new Date(fromDate);
		const to = new Date(toDate);
		to.setHours(23,59,59,999);
		filter.createdAt = { $gte: from, $lte: to };
	}
	// pagination
	const page = Math.max(parseInt(req.query.page || '1', 10), 1);
	const limit = Math.max(parseInt(req.query.limit || '20', 10), 1);
	const total = await Product.countDocuments(filter);
	const totalPages = Math.max(Math.ceil(total / limit), 1);
	const products = await Product.find(filter)
		.skip((page - 1) * limit)
		.limit(limit)
		.lean();

	res.render('quick-update', { products, q, page, totalPages, limit, total });
});

// JSON endpoint used by infinite scroll on quick-update page
app.get('/quick-update-data', async (req, res) => {
	if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
	const { q = '', fromDate = '', toDate = '' } = req.query; // search query and dates
	let filter = {};
	if (q && q.trim() !== '') {
		const regex = new RegExp(q.trim(), 'i');
		filter.$or = [
			{ customerName: regex },
			{ productName: regex }
		];
	}
	if (fromDate && toDate) {
		const from = new Date(fromDate);
		const to = new Date(toDate);
		to.setHours(23,59,59,999);
		filter.createdAt = { $gte: from, $lte: to };
	}
	const page = Math.max(parseInt(req.query.page || '1', 10), 1);
	const limit = Math.max(parseInt(req.query.limit || '20', 10), 1);
	const total = await Product.countDocuments(filter);
	const totalPages = Math.max(Math.ceil(total / limit), 1);
	const products = await Product.find(filter)
		.skip((page - 1) * limit)
		.limit(limit)
		.lean();

	res.json({ products, page, totalPages, limit, total });
});

// Route to show edit form for a selected product
app.get('/edit-specifications/:id', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const product = await Product.findById(req.params.id);
	if (!product) return res.status(404).send('Product not found');
	res.render('edit-specifications', { product });
});

// Route to handle specification update
app.post('/edit-specifications/:id', upload.single('drawing'), async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const update = {
		'specifications.ply': req.body.ply,
		'specifications.fluteType': req.body.fluteType,
		'specifications.length': req.body.length,
		'specifications.width': req.body.width,
		'specifications.height': req.body.height,
		'specifications.unitOfMeasurement': req.body.unitOfMeasurement,
		'specifications.burstingStrength': req.body.burstingStrength,
		'specifications.BCT': req.body.BCT,
		'specifications.ECT': req.body.ECT,
		'specifications.FCT': req.body.FCT,
		'specifications.moisture': req.body.moisture,
		'specifications.weight': req.body.weight
	};
	if (req.file) {
		update.drawingPath = '/uploads/' + req.file.filename;
	}
	await Product.findByIdAndUpdate(req.params.id, update);
	res.redirect('/products');
});
// Update product delivery/approval
app.get('/update-product/:id', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const product = await Product.findById(req.params.id);
	res.render('update-product', { product });
});

app.post('/update-product/:id', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const update = {
		deliveredDate: req.body.deliveredDate,
		dcDetails: req.body.dcDetails,
		courierDetails: req.body.courierDetails,
		approvedDate: req.body.approvedDate,
		approvalStatus: req.body.approvalStatus,
		rejectionReason: req.body.rejectionReason
	};
	// Capture order metrics only when approved
	if (req.body.approvalStatus === 'Approved') {
		if (req.body.orderQuantity) {
			const oq = Number(req.body.orderQuantity);
			if (!isNaN(oq)) update.orderQuantity = oq;
		}
		if (req.body.orderValue) {
			const ov = Number(req.body.orderValue);
			if (!isNaN(ov)) update.orderValue = ov;
		}
	}

	// Capture sampling cost fields (optional, regardless of approval)
	const sc = {
		stereoCost: Number(req.body.stereoCost || 0) || 0,
		dieCost: Number(req.body.dieCost || 0) || 0,
		boardCost: Number(req.body.boardCost || 0) || 0,
		printingCost: Number(req.body.printingCost || 0) || 0,
		manhourCost: Number(req.body.manhourCost || 0) || 0,
		courierCost: Number(req.body.courierCost || 0) || 0,
	};
	sc.totalSampleCost = sc.stereoCost + sc.dieCost + sc.boardCost + sc.printingCost + sc.manhourCost + sc.courierCost;

	update['sampleCosts'] = sc;
	// If status update fields are present, push to statusUpdates array
	if (req.body.statusDate && req.body.status && req.body.statusDetails) {
		await Product.findByIdAndUpdate(req.params.id, {
			$set: update,
			$push: {
				statusUpdates: {
					date: req.body.statusDate,
					status: req.body.status,
					details: req.body.statusDetails
				}
			}
		});
	} else {
		await Product.findByIdAndUpdate(req.params.id, update);
	}
	// After updating delivery/approval info, return to the main quick-update list (where user can search/browse)
	res.redirect('/quick-update');
});

// Start server

// XLSX download route for report
const XLSX = require('xlsx');
app.get('/download-report', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const { fromDate = '', toDate = '', status = '', dateField = '' } = req.query;
	let filter = {};

	// When dateField=createdAt is provided (dashboard links), apply createdAt filter.
	if (fromDate && toDate) {
		if (dateField === 'createdAt') {
			const from = new Date(fromDate);
			const to = new Date(toDate);
			to.setHours(23,59,59,999);
			filter.createdAt = { $gte: from, $lte: to };
		} else {
			filter.requiredDate = { $gte: fromDate, $lte: toDate };
		}
	}

	// Filter by status
	if (status) {
		if (status === 'Sample request given') {
			// total requests -> no extra filter
		} else if (status === 'Sample to be submitted') {
			filter.deliveredDate = { $in: [null, ''] };
			filter.approvalStatus = { $in: [null, '', undefined] };
		} else if (status === 'Sample submitted for Approval') {
			filter.deliveredDate = { $ne: null };
			filter.approvalStatus = { $in: [null, '', undefined] };
		} else if (status === 'Sample approved') {
			filter.approvalStatus = 'Approved';
		} else if (status === 'Sample rejected') {
			filter.approvalStatus = 'Rejected';
		} else if (status === 'Resample' || status === 'Submit fresh sample') {
			filter.approvalStatus = 'Resample';
		} else if (status === 'Ontime') {
			filter.$expr = { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $lte: ["$deliveredDate", "$requiredDate"] } ] };
		} else if (status === 'Delayed') {
			filter.$expr = { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $gt: ["$deliveredDate", "$requiredDate"] } ] };
		} else if (status === 'HOLD') {
			filter.approvalStatus = { $regex: '^HOLD', $options: 'i' };
		} else if (status === 'Cancelled') {
			filter.approvalStatus = { $regex: '^cancel', $options: 'i' };
		}
	}

	const products = await Product.find(filter).lean();

	// Prepare data for XLSX
	const data = products.map((p, idx) => ({
		'Sl. No': idx + 1,
		'Person Name': p.personName,
		'Request Date': p.createdAt ? (new Date(p.createdAt)).toISOString().slice(0,10) : '',
		'Customer Name': p.customerName,
		'Product Name': p.productName,
		'Ply': p.specifications?.ply,
		'Flute Type': p.specifications?.fluteType,
	'Length': p.specifications?.length,
	'Width': p.specifications?.width,
	'Height': p.specifications?.height,
	'UOM': p.specifications?.unitOfMeasurement,
		'Bursting Strength': p.specifications?.burstingStrength,
		'BCT': p.specifications?.BCT,
		'ECT': p.specifications?.ECT,
		'FCT': p.specifications?.FCT,
		'Moisture': p.specifications?.moisture,
		'Weight': p.specifications?.weight,
		'No. of Colors': p.printing?.noOfColors,
		'Printing Type': p.printing?.type,
		'Colors to be Printed': p.printing?.colors,
		'Sample Type': p.sampleType,
		'No. of Samples': p.noOfSamples,
		'Required Date': p.requiredDate,
		'Delivery Address': p.deliveryAddress,
		'Customer Contact': p.customerContact,
		'Contact No': p.contactNo,
		'Created By': p.createdBy,
		'Delivered Date': p.deliveredDate,
		'DC Details': p.dcDetails,
		'Courier Details': p.courierDetails,
		'Approved Date': p.approvedDate,
		'Approval Status': p.approvalStatus,
		'Order Quantity': p.orderQuantity,
		'Order Value': p.orderValue,
		'Stereo Cost': p.sampleCosts?.stereoCost || 0,
		'Die Cost': p.sampleCosts?.dieCost || 0,
		'Board Cost': p.sampleCosts?.boardCost || 0,
		'Printing Cost': p.sampleCosts?.printingCost || 0,
		'Manhour Cost': p.sampleCosts?.manhourCost || 0,
		'Courier Cost': p.sampleCosts?.courierCost || 0,
		'Total Sample Cost': p.sampleCosts?.totalSampleCost || 0,
		'Rejection Reason': p.rejectionReason,
	'Drawing Path': p.drawingPath,
	'Status Updates': Array.isArray(p.statusUpdates) ? p.statusUpdates.map(su => `${su.date}: ${su.status} - ${su.details}`).join('; ') : ''
	}));

	const ws = XLSX.utils.json_to_sheet(data);
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Report');
	const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

	res.setHeader('Content-Disposition', 'attachment; filename="report.xlsx"');
	res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
	res.send(buf);
	});
	// Performance report (same filters as /report) but exported XLSX excludes specification details
	app.get('/performance-report', async (req, res) => {
		// reuse same filtering logic as /report
		if (!req.session.user) return res.redirect('/login');
		const { fromDate = '', toDate = '', status = '', dateField = '' } = req.query;
		let filter = {};
		if (fromDate && toDate) {
			if (dateField === 'createdAt') {
				const from = new Date(fromDate);
				const to = new Date(toDate);
				to.setHours(23,59,59,999);
				filter.createdAt = { $gte: from, $lte: to };
			} else {
				filter.requiredDate = { $gte: fromDate, $lte: toDate };
			}
		}
		// status mapping (same as /report)
		if (status) {
			if (status === 'Sample request given') {
				// no extra filter
			} else if (status === 'Sample to be submitted') {
				filter.deliveredDate = { $in: [null, ''] };
				filter.approvalStatus = { $in: [null, '', undefined] };
			} else if (status === 'Sample submitted for Approval') {
				filter.deliveredDate = { $ne: null };
				filter.approvalStatus = { $in: [null, '', undefined] };
			} else if (status === 'Sample approved') {
				filter.approvalStatus = 'Approved';
			} else if (status === 'Sample rejected') {
				filter.approvalStatus = 'Rejected';
			} else if (status === 'Resample') {
				filter.approvalStatus = 'Resample';
			} else if (status === 'Ontime') {
				filter.$expr = { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $lte: ["$deliveredDate", "$requiredDate"] } ] };
			} else if (status === 'Delayed') {
				filter.$expr = { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $gt: ["$deliveredDate", "$requiredDate"] } ] };
			} else if (status === 'HOLD') {
				filter.approvalStatus = { $regex: '^HOLD', $options: 'i' };
			} else if (status === 'Cancelled') {
				filter.approvalStatus = { $regex: '^cancel', $options: 'i' };
			}
		}
		const products = await Product.find(filter).lean();
		res.render('performance-report', { products, fromDate, toDate, status, dateField });
	});

	app.get('/download-performance-report', async (req, res) => {
		if (!req.session.user) return res.redirect('/login');
		const { fromDate = '', toDate = '', status = '', dateField = '' } = req.query;
		let filter = {};
		if (fromDate && toDate) {
			if (dateField === 'createdAt') {
				const from = new Date(fromDate);
				const to = new Date(toDate);
				to.setHours(23,59,59,999);
				filter.createdAt = { $gte: from, $lte: to };
			} else {
				filter.requiredDate = { $gte: fromDate, $lte: toDate };
			}
		}
		// same status mapping as above
		if (status) {
			if (status === 'Sample request given') {
			} else if (status === 'Sample to be submitted') {
				filter.deliveredDate = { $in: [null, ''] };
				filter.approvalStatus = { $in: [null, '', undefined] };
			} else if (status === 'Sample submitted for Approval') {
				filter.deliveredDate = { $ne: null };
				filter.approvalStatus = { $in: [null, '', undefined] };
			} else if (status === 'Sample approved') {
				filter.approvalStatus = 'Approved';
			} else if (status === 'Sample rejected') {
				filter.approvalStatus = 'Rejected';
			} else if (status === 'Resample' || status === 'Submit fresh sample') {
				filter.approvalStatus = 'Resample';
			} else if (status === 'Ontime') {
				filter.$expr = { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $lte: ["$deliveredDate", "$requiredDate"] } ] };
			} else if (status === 'Delayed') {
				filter.$expr = { $and: [ { $ne: ["$deliveredDate", null] }, { $ne: ["$deliveredDate", ""] }, { $ne: ["$requiredDate", null] }, { $ne: ["$requiredDate", ""] }, { $gt: ["$deliveredDate", "$requiredDate"] } ] };
			} else if (status === 'HOLD') {
				filter.approvalStatus = { $regex: '^HOLD', $options: 'i' };
			} else if (status === 'Cancelled') {
				filter.approvalStatus = { $regex: '^cancel', $options: 'i' };
			}
		}
		const products = await Product.find(filter).lean();

		// Prepare data for XLSX - exclude specification details
		const data = products.map((p, idx) => ({
			'Sl. No': idx + 1,
			'Person Name': p.personName,
			'Request Date': p.createdAt ? (new Date(p.createdAt)).toISOString().slice(0,10) : '',
			'Customer Name': p.customerName,
			'Product Name': p.productName,
			'No. of Samples': p.noOfSamples,
			'Required Date': p.requiredDate,
			'Delivery Address': p.deliveryAddress,
			'Customer Contact': p.customerContact,
			'Contact No': p.contactNo,
			'Created By': p.createdBy,
			'Delivered Date': p.deliveredDate,
			'DC Details': p.dcDetails,
			'Courier Details': p.courierDetails,
			'Approved Date': p.approvedDate,
			'Approval Status': p.approvalStatus,
			'Order Quantity': p.orderQuantity,
			'Order Value': p.orderValue,
			'Stereo Cost': p.sampleCosts?.stereoCost || 0,
			'Die Cost': p.sampleCosts?.dieCost || 0,
			'Board Cost': p.sampleCosts?.boardCost || 0,
			'Printing Cost': p.sampleCosts?.printingCost || 0,
			'Manhour Cost': p.sampleCosts?.manhourCost || 0,
			'Courier Cost': p.sampleCosts?.courierCost || 0,
			'Total Sample Cost': p.sampleCosts?.totalSampleCost || 0,
			'Rejection Reason': p.rejectionReason,
			'Drawing Path': p.drawingPath,
			'Status Updates': Array.isArray(p.statusUpdates) ? p.statusUpdates.map(su => `${su.date}: ${su.status} - ${su.details}`).join('; ') : ''
		}));

		const ws2 = XLSX.utils.json_to_sheet(data);
		const wb2 = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb2, ws2, 'Performance Report');
		const buf2 = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' });

		res.setHeader('Content-Disposition', 'attachment; filename="performance-report.xlsx"');
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.send(buf2);
	});

// Daily Updates Report - shows all product updates on a specific date
app.get('/daily-updates', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const { date = '' } = req.query;
	let products = [];
	
	if (date) {
		// Find products updated on the selected date
		const startOfDay = new Date(date);
		startOfDay.setHours(0, 0, 0, 0);
		const endOfDay = new Date(date);
		endOfDay.setHours(23, 59, 59, 999);
		
		products = await Product.find({
			updatedAt: { $gte: startOfDay, $lte: endOfDay }
		}).sort({ updatedAt: -1 }).lean();
	}
	
	res.render('daily-updates', { products, selectedDate: date });
});

// Current Status - search and view complete product details
app.get('/current-status', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const { q = '', page = 1, limit = 50 } = req.query;
	let products = [];
	let totalProducts = 0;
	
	if (q.trim()) {
		// Search in product name, customer name, and product code
		const searchRegex = new RegExp(q.trim(), 'i');
		const query = {
			$or: [
				{ productName: searchRegex },
				{ customerName: searchRegex },
				{ productCode: searchRegex }
			]
		};
		
		totalProducts = await Product.countDocuments(query);
		products = await Product.find(query)
			.sort({ updatedAt: -1 })
			.skip((page - 1) * limit)
			.limit(parseInt(limit))
			.lean();
	}
	
	const totalPages = Math.ceil(totalProducts / limit);
	
	res.render('current-status', {
		products,
		q,
		page: parseInt(page),
		limit: parseInt(limit),
		totalProducts,
		totalPages
	});
});

// Order Data Sheet routes
app.get('/order-data-sheet', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const { q = '', page = 1, limit = 50 } = req.query;
	let products = [];
	let totalProducts = 0;
	
	if (q.trim()) {
		const searchRegex = new RegExp(q.trim(), 'i');
		const query = {
			$or: [
				{ productName: searchRegex },
				{ customerName: searchRegex }
			]
		};
		
		totalProducts = await Product.countDocuments(query);
		products = await Product.find(query)
			.sort({ createdAt: -1 })
			.skip((page - 1) * limit)
			.limit(parseInt(limit))
			.lean();
	}
	
	const totalPages = Math.ceil(totalProducts / limit);
	
	res.render('order-data-sheet', {
		products,
		q,
		page: parseInt(page),
		limit: parseInt(limit),
		totalProducts,
		totalPages
	});
});

app.get('/order-data-sheet/:id', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const product = await Product.findById(req.params.id).lean();
	if (!product) return res.status(404).send('Product not found');
	
	// Determine ply from specifications
	const ply = parseInt(product.specifications?.ply) || 3;
	
	// Initialize orderDataSheet if not present
	if (!product.orderDataSheet) {
		product.orderDataSheet = { reelSize: '', cuttingSize: '', layers: [], processes: [] };
	}
	if (!product.orderDataSheet.layers || product.orderDataSheet.layers.length === 0) {
		if (ply === 3) {
			product.orderDataSheet.layers = [
				{ name: 'Top', gsm: '', bf: '', shade: '', mill: '', fluteType: '' },
				{ name: 'Flute 1', gsm: '', bf: '', shade: '', mill: '', fluteType: '' },
				{ name: 'Packing 1', gsm: '', bf: '', shade: '', mill: '', fluteType: '' }
			];
		} else if (ply === 5) {
			product.orderDataSheet.layers = [
				{ name: 'Top', gsm: '', bf: '', shade: '', mill: '', fluteType: '' },
				{ name: 'Flute 1', gsm: '', bf: '', shade: '', mill: '', fluteType: '' },
				{ name: 'Packing 1', gsm: '', bf: '', shade: '', mill: '', fluteType: '' },
				{ name: 'Flute 2', gsm: '', bf: '', shade: '', mill: '', fluteType: '' },
				{ name: 'Packing 2', gsm: '', bf: '', shade: '', mill: '', fluteType: '' }
			];
		}
	}
	if (!product.orderDataSheet.processes) {
		product.orderDataSheet.processes = [];
	}
	
	res.render('order-data-sheet-form', { product, ply });
});

app.post('/order-data-sheet/:id', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	
	const layers = [];
	const layerNames = req.body.layerName;
	const gsms = req.body.gsm;
	const bfs = req.body.bf;
	const shades = req.body.shade;
	const mills = req.body.mill;
	const fluteTypes = req.body.fluteType;
	
	if (Array.isArray(layerNames)) {
		for (let i = 0; i < layerNames.length; i++) {
			layers.push({
				name: layerNames[i],
				gsm: gsms[i] || '',
				bf: bfs[i] || '',
				shade: shades[i] || '',
				mill: mills[i] || '',
				fluteType: fluteTypes[i] || ''
			});
		}
	}
	
	const processes = [];
	const processNames = req.body.processName;
	const machines = req.body.machine;
	const ups = req.body.ups;
	const joints = req.body.joints;
	
	if (Array.isArray(processNames)) {
		for (let i = 0; i < processNames.length; i++) {
			processes.push({
				name: processNames[i] || '',
				machine: machines[i] || '',
				ups: ups[i] || '',
				joints: joints[i] || ''
			});
		}
	}
	
	await Product.findByIdAndUpdate(req.params.id, {
		$set: { 
			'orderDataSheet.reelSize': req.body.reelSize || '',
			'orderDataSheet.cuttingSize': req.body.cuttingSize || '',
			'orderDataSheet.dieNo': req.body.dieNo || '',
			'orderDataSheet.dieCuttingBoardReelSize': req.body.dieCuttingBoardReelSize || '',
			'orderDataSheet.dieCuttingBoardCuttingSize': req.body.dieCuttingBoardCuttingSize || '',
			'orderDataSheet.layers': layers,
			'orderDataSheet.processes': processes
		}
	});
	
	res.redirect('/order-data-sheet');
});

// ODS Report
app.get('/ods-report', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	
	const { q, id } = req.query;
	let product = null;
	let products = [];
	
	if (id) {
		// Display specific product ODS report
		product = await Product.findById(id).lean();
	} else if (q) {
		// Search for products
		const searchRegex = new RegExp(q, 'i');
		products = await Product.find({
			$or: [
				{ productName: searchRegex },
				{ customerName: searchRegex },
				{ slNo: parseInt(q) || -1 }
			]
		})
		.sort({ createdAt: -1 })
		.limit(20)
		.lean();
	}
	
	res.render('ods-report', { product, products, q: q || '', user: req.session.user });
});

// Admin user management routes
app.get('/admin/users', async (req, res) => {
	if (!req.session.user) {
		return res.status(401).send('<h2>Admin access required</h2><p>Please <a href="/login">login</a> as an admin user.</p>');
	}
	if (!isAdmin(req)) {
		return res.status(403).send('<h2>Forbidden</h2><p>You must be logged in as an admin to access this page.</p>');
	}
	const users = await User.find();
	res.render('admin-users', { users });
});

app.post('/admin/create-user', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).send('Forbidden: Admins only');
	try {
		const { username, password, isAdmin } = req.body;
		// Basic validation
		if (!username || !password) {
			return res.status(400).send('Username and password are required');
		}

		const hash = await bcrypt.hash(password, 10);
		const user = new User({ username, password: hash, isAdmin: isAdmin === 'true' });
		await user.save();
		// If this was an AJAX request, return JSON so the client can clear the form without a full reload
		const wantsJson = (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1) || req.headers['x-requested-with'] === 'XMLHttpRequest');
		if (wantsJson) {
			return res.json({ success: true, user: { _id: user._id, username: user.username, isAdmin: !!user.isAdmin } });
		}
		return res.redirect('/admin/users');
	} catch (err) {
		// Log the full error to server logs for debugging (do not log sensitive fields)
		console.error('Error in /admin/create-user:', err && err.stack ? err.stack : err);
		try {
			console.error('Request username:', req.body && req.body.username);
			console.error('Session user:', req.session && req.session.user ? req.session.user.username : null);
		} catch (logErr) {
			console.error('Error logging request/session info:', logErr);
		}
		// Return a helpful message (error message only) so the client can show it.
		const publicMessage = err && err.message ? `Internal server error: ${err.message}` : 'Internal server error while creating user';
		return res.status(500).send(publicMessage);
	}
});

app.post('/admin/delete-user/:id', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).send('Forbidden: Admins only');
	await User.findByIdAndDelete(req.params.id);
	res.redirect('/admin/users');
});

// Admin: send test email
app.post('/admin/test-email', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).send('Forbidden: Admins only');
	try {
		if (!SENDGRID_API_KEY) {
			return res.status(400).send('SENDGRID_API_KEY not set on server');
		}
		const toInput = (req.body.to && req.body.to.trim()) || '';
		const toList = toInput ? toInput.split(',').map(e => e.trim()) : RECIPIENTS;
		await sgMail.send({
			to: toList,
			from: EMAIL_FROM,
			subject: 'Test Email - Daily Updates Mailer',
			html: '<p>This is a test email from NPD-app. If you received this, email configuration works.</p>'
		});
		res.redirect('/admin/users');
	} catch (err) {
		// Enhanced diagnostic logging for SendGrid errors
		if (err && err.response && err.response.body) {
			console.error('SendGrid error body:', JSON.stringify(err.response.body));
		}
		console.error('Test email send failed:', err && err.stack ? err.stack : err);
		let detail = err && err.message ? err.message : 'Unknown error';
		if (err && err.code === 403) {
			detail += ' (Forbidden: verify API key permissions and sender authentication)';
		}
		if (err && err.response && err.response.body && err.response.body.errors) {
			detail += ' | ' + err.response.body.errors.map(e => e.message).join('; ');
		}
		res.status(500).send('Failed to send test email: ' + detail);
	}
});

// Admin: manually run daily email now (registered after app init)
app.post('/admin/run-daily-email', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).send('Forbidden: Admins only');
	try {
		await sendDailyUpdatesEmail();
		res.redirect('/admin/users');
	} catch (err) {
		console.error('Manual daily email failed:', err);
		res.status(500).send('Manual daily email failed: ' + (err && err.message ? err.message : 'Unknown error'));
	}
});
