// MongoDB database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 27017,
  dbName: process.env.DB_NAME || 'restaurantApp',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'password',
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
};
module.exports = dbConfig;
