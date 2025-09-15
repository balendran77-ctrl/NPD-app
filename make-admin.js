const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://balendran77_db_user:nGQNOnk9WiAWb2Ak@clusternpd.l1uhkka.mongodb.net/productdev?retryWrites=true&w=majority&appName=ClusterNPD' // Replace with your actual MongoDB URI

// Define User schema (copy from your index.js)
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  isAdmin: Boolean
});
const User = mongoose.model('User', userSchema);

mongoose.connect(MONGODB_URI)
  .then(() => {
    return User.updateOne({ username: 'BALENDRAN' }, { $set: { isAdmin: true } });
  })
  .then(res => {
    console.log('User updated:', res);
    mongoose.disconnect();
  })
  .catch(err => {
    console.error(err);
    mongoose.disconnect();
  });
