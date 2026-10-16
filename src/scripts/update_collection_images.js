import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: 'c:/Users/Admin/theribbonstory/backend/.env' });

const srcDir = 'C:/Users/Admin/.gemini/antigravity-ide/brain/78eea731-126c-4b12-9be9-fbe95ce5ed0a';
const destDir = 'c:/Users/Admin/theribbonstory/frontend/public/images/collections';

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const mapping = [
  { file: 'desk_buddies_3d_1792132168462.jpg', slug: 'desk-buddies', target: 'desk-buddies.jpg' },
  { file: 'laptop_buddies_3d_1792132240197.jpg', slug: 'laptop-buddies', target: 'laptop-buddies.jpg' },
  { file: 'articulated_flexi_3d_1792132262842.jpg', slug: 'articulated-flexi', target: 'articulated-flexi.jpg' },
  { file: 'love_togetherness_3d_1792132290162.jpg', slug: 'love-togetherness', target: 'love-togetherness.jpg' },
  { file: 'little_creatures_3d_1792132321534.jpg', slug: 'little-creatures', target: 'little-creatures.jpg' },
  { file: 'seasonal_keepsakes_3d_1792132350018.jpg', slug: 'seasonal-keepsakes', target: 'seasonal-keepsakes.jpg' },
];

for (const item of mapping) {
  const src = path.join(srcDir, item.file);
  const dest = path.join(destDir, item.target);
  fs.copyFileSync(src, dest);
  console.log(`Copied ${item.file} -> ${item.target}`);
}

async function updateDb() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('No MONGODB_URI found');
    return;
  }
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const Category = mongoose.model('Category', new mongoose.Schema({
    slug: String,
    image: String
  }, { strict: false }));

  for (const item of mapping) {
    const imgPath = `/images/collections/${item.target}`;
    const res = await Category.updateOne({ slug: item.slug }, { $set: { image: imgPath } });
    console.log(`Updated ${item.slug}: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
  }

  const all = await Category.find({}, { name: 1, slug: 1, image: 1 });
  console.log('Current categories:', all);

  await mongoose.disconnect();
}

updateDb().catch(console.error);
