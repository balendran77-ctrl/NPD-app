// ...existing code...
// ...existing code...
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

// Connect to MongoDB (replace with your connection string)
mongoose.connect('mongodb+srv://balendran77_db_user:nGQNOnk9WiAWb2Ak@clusternpd.l1uhkka.mongodb.net/productdev?retryWrites=true&w=majority&appName=ClusterNPD', { useNewUrlParser: true, useUnifiedTopology: true });
// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: 'your_secret', resave: false, saveUninitialized: true }));
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
app.get('/', (req, res) => {
	res.render('index', { user: req.session.user });
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
		res.redirect('/');
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
	const { fromDate = '', toDate = '', status = '' } = req.query;
	let filter = {};

	// Filter by status
       if (status) {
	       if (status === 'Sample request given') {
		       filter.deliveredDate = { $in: [null, ''] };
	       } else if (status === 'Sample submitted for Approval') {
		       filter.deliveredDate = { $ne: null };
		       filter.approvalStatus = { $in: [null, '', undefined] };
	       } else if (status === 'Sample approved') {
		       filter.approvalStatus = 'Approved';
	       } else if (status === 'Sample rejected') {
		       filter.approvalStatus = 'Rejected';
	       } else if (status === 'Submit fresh sample') {
		       filter.approvalStatus = 'Resample';
	       } else if (status === 'Waiting for approval') {
		       filter.deliveredDate = { $ne: null };
		       filter.approvalStatus = { $in: [null, '', undefined] };
	       } else if (status === 'HOLD by customer') {
		       filter.approvalStatus = 'HOLD by customer';
	       } else if (status === 'Hold by Marketing team') {
		       filter.approvalStatus = 'Hold by Marketing team';
	       }
       }

	// Filter by date range
	if (fromDate && toDate) {
		filter.requiredDate = { $gte: fromDate, $lte: toDate };
	}

	const products = await Product.find(filter).lean();
	res.render('report', { products, fromDate, toDate, status });
});

// Product Schema
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
	sampleType: String, // FAI, Size and spec, only size
	noOfSamples: String,
	requiredDate: String,
	deliveryAddress: String,
	customerContact: String,
	contactNo: String,
	createdBy: String,
	deliveredDate: String,
	dcDetails: String,
	courierDetails: String,
	approvedDate: String,
	approvalStatus: String, // Approved, Rejected, Resample
	rejectionReason: String,
	drawingPath: String, // File path for drawing/photo
	statusUpdates: [{
		date: String,
		status: String,
		details: String
	}]
});
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
// Route to show searchable product list for editing specifications
app.get('/edit-specifications', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const products = await Product.find({});
	res.render('select-product', { products });
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
	res.redirect('/products');
});
});

// Start server

// XLSX download route for report
const XLSX = require('xlsx');
app.get('/download-report', async (req, res) => {
	if (!req.session.user) return res.redirect('/login');
	const { fromDate = '', toDate = '', status = '' } = req.query;
	let filter = {};

	// Filter by status
	if (status) {
		if (status === 'Sample request given') {
			filter.deliveredDate = { $in: [null, ''] };
		} else if (status === 'Sample submitted for Approval') {
			filter.deliveredDate = { $ne: null };
			filter.approvalStatus = { $in: [null, '', undefined] };
		} else if (status === 'Sample approved') {
			filter.approvalStatus = 'Approved';
		} else if (status === 'Sample rejected') {
			filter.approvalStatus = 'Rejected';
		} else if (status === 'Submit fresh sample') {
			filter.approvalStatus = 'Resample';
		}
	}

	// Filter by date range
	if (fromDate && toDate) {
		filter.requiredDate = { $gte: fromDate, $lte: toDate };
	}

	const products = await Product.find(filter).lean();

	// Prepare data for XLSX
	const data = products.map((p, idx) => ({
		'Sl. No': idx + 1,
		'Person Name': p.personName,
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

app.listen(3000, () => {
	console.log('Server running on http://localhost:3000');
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
	const { username, password, isAdmin } = req.body;
	const hash = await bcrypt.hash(password, 10);
	const user = new User({ username, password: hash, isAdmin: isAdmin === 'true' });
	await user.save();
	res.redirect('/admin/users');
});

app.post('/admin/delete-user/:id', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).send('Forbidden: Admins only');
	await User.findByIdAndDelete(req.params.id);
	res.redirect('/admin/users');
});
