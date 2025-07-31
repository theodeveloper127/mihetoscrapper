const mongoose = require('mongoose');
const MovieSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true },
  thumbnailUrl: { type: String, required: true },
  type: { type: String, enum: ['original', 'translated'], required: true },
  category: { type: String, required: true, trim: true },
  rating: { type: Number, required: true, min: 0, max: 10 }, // Assuming a rating scale
  uploadDate: { type: Date, default: Date.now }, // Default to current date/time
  description: { type: String, required: true, trim: true },
  trailerUrl: { type: String, required: true },
  isSeries: { type: Boolean, required: true, default: false },
  relationship: { type: String, trim: true }, // Used to group series or movies
  comingSoon: { type: Boolean, required: true, default: false },
  releaseDate: { type: Date }, // Optional
  translator: { type: String, trim: true }, // Optional
  watchUrl: { type: String, required: true },
  downloadUrl: { type: String }, // Optional
});
const Movie = mongoose.model('Movie', MovieSchema);
module.exports = Movie; 
