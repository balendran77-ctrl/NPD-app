const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');

const app = express();

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
	password: String
});
const User = mongoose.model('User', userSchema);

// Home page
app.get('/', (req, res) => {
	res.render('index', { user: req.session.user });
});

// Register
app.get('/register', (req, res) => {
	res.render('register');
});
app.post('/register', async (req, res) => {
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
		req.session.user = user;
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
		burstingStrength: String,
		BCT: String,
		ECT: String,
		FCT: String,
		moisture: String,
		weight: String
	},
	printing: {
		type: mongoose.Schema.Types.Mixed
    },
	sampleType: String, // FAI, Size and spec, only size
	noOfSamples: String,
	requiredDate: String,
	deliveryAddress: String,
	customerContact: String,
	contactNo: String,
	createdBy: String,
	deliveredDate: String,
	approvedDate: String,
	approvalStatus: String, // Approved, Rejected, Resample
	rejectionReason: String
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
		approvedDate: req.body.approvedDate,
		approvalStatus: req.body.approvalStatus,
		rejectionReason: req.body.rejectionReason
	};
	await Product.findByIdAndUpdate(req.params.id, update);
	res.redirect('/products');
});
});

// Start server
app.listen(3000, () => {
	console.log('Server running on http://localhost:3000');
});
