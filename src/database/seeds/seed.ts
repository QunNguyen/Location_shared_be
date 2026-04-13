/**
 * Database Seed Script
 * Run: npm run seed
 */
import 'reflect-metadata';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/location_shared';

// ─── Schemas (inline for seed script) ────────────────────────────────────────

const UserSchema = new mongoose.Schema({
  fullName: String,
  email: { type: String, unique: true },
  password: String,
  phone: String,
  address: String,
  interests: [String],
  avatarUrl: String,
  role: { type: String, default: 'user' },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: true },
  blockedUsers: [],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const PostSchema = new mongoose.Schema({
  author: mongoose.Schema.Types.ObjectId,
  title: String,
  description: String,
  images: [String],
  imageKeys: [String],
  tags: [String],
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],
  },
  locationName: String,
  viewCount: { type: Number, default: 0 },
  likeCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const ReviewSchema = new mongoose.Schema({
  post: mongoose.Schema.Types.ObjectId,
  author: mongoose.Schema.Types.ObjectId,
  rating: Number,
  comment: String,
  images: [String],
  createdAt: { type: Date, default: Date.now },
});

// ─── Seed Data ────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected');

  const UserModel = mongoose.model('User', UserSchema);
  const PostModel = mongoose.model('Post', PostSchema);
  const ReviewModel = mongoose.model('Review', ReviewSchema);

  // Clear existing data
  await Promise.all([
    UserModel.deleteMany({}),
    PostModel.deleteMany({}),
    ReviewModel.deleteMany({}),
  ]);
  console.log('🗑️  Cleared existing data');

  // Create users
  const hashedPassword = await bcrypt.hash('Password@123', 12);

  const users = await UserModel.insertMany([
    {
      fullName: 'Nguyen Van Quan (Admin)',
      email: 'admin@locationshared.com',
      password: hashedPassword,
      phone: '0901234567',
      address: 'Ho Chi Minh City',
      interests: ['travel', 'photography', 'food'],
      role: 'admin',
    },
    {
      fullName: 'Le Thi Hoa',
      email: 'hoa@example.com',
      password: hashedPassword,
      phone: '0912345678',
      address: 'Ha Noi',
      interests: ['travel', 'nature'],
      role: 'user',
    },
    {
      fullName: 'Tran Van Minh',
      email: 'minh@example.com',
      password: hashedPassword,
      phone: '0923456789',
      address: 'Da Nang',
      interests: ['beach', 'food', 'culture'],
      role: 'user',
    },
    {
      fullName: 'Pham Thi Lan',
      email: 'lan@example.com',
      password: hashedPassword,
      phone: '0934567890',
      address: 'Can Tho',
      interests: ['nature', 'photography'],
      role: 'user',
    },
  ]);

  console.log(`👥 Created ${users.length} users`);

  // Create posts
  const posts = await PostModel.insertMany([
    {
      author: users[0]._id,
      title: 'Bến Ninh Kiều - Điểm Check-in Nổi Tiếng Cần Thơ',
      description:
        'Bến Ninh Kiều là một trong những điểm du lịch nổi tiếng nhất tại thành phố Cần Thơ. Đây là nơi có thể ngắm sông Hậu hiền hòa và thưởng thức ẩm thực đặc sắc của miền Tây Nam Bộ.',
      tags: ['cantho', 'mekong', 'travel', 'food'],
      locationName: 'Bến Ninh Kiều, Cần Thơ',
      location: { type: 'Point', coordinates: [105.7893, 10.034] },
      averageRating: 4.5,
      reviewCount: 2,
      viewCount: 150,
    },
    {
      author: users[1]._id,
      title: 'Hội An Ancient Town - Di Sản Văn Hóa Thế Giới',
      description:
        'Phố cổ Hội An là một trong những địa điểm du lịch nổi tiếng nhất Việt Nam. Với kiến trúc cổ kính, đèn lồng rực rỡ và ẩm thực phong phú, đây là điểm đến không thể bỏ qua.',
      tags: ['hoian', 'heritage', 'culture', 'travel'],
      locationName: 'Phố Cổ Hội An, Quảng Nam',
      location: { type: 'Point', coordinates: [108.3264, 15.8801] },
      averageRating: 4.8,
      reviewCount: 3,
      viewCount: 320,
    },
    {
      author: users[2]._id,
      title: 'Mũi Né Beach - Thiên Đường Bãi Biển Bình Thuận',
      description:
        'Mũi Né nổi tiếng với những đồi cát vàng trải dài, bãi biển xanh trong và resort đẳng cấp quốc tế. Đây là thiên đường nghỉ dưỡng lý tưởng cho mọi du khách.',
      tags: ['muine', 'beach', 'sand-dunes', 'resort'],
      locationName: 'Mũi Né, Phan Thiết, Bình Thuận',
      location: { type: 'Point', coordinates: [108.2882, 10.9438] },
      averageRating: 4.2,
      reviewCount: 1,
      viewCount: 200,
    },
    {
      author: users[3]._id,
      title: 'Đà Lạt - Thành Phố Ngàn Hoa Xứ Lạnh',
      description:
        'Đà Lạt được mệnh danh là Paris của phương Đông với khí hậu mát mẻ quanh năm, những vườn hoa rực rỡ và kiến trúc Pháp cổ điển. Điểm du lịch không thể thiếu khi xuống miền Nam.',
      tags: ['dalat', 'flower', 'highland', 'cool'],
      locationName: 'Đà Lạt, Lâm Đồng',
      location: { type: 'Point', coordinates: [108.4583, 11.9404] },
      averageRating: 4.7,
      reviewCount: 2,
      viewCount: 280,
    },
  ]);

  console.log(`📝 Created ${posts.length} posts`);

  // Create reviews
  const reviews = await ReviewModel.insertMany([
    {
      post: posts[0]._id,
      author: users[1]._id,
      rating: 5,
      comment: 'Rất đẹp và thơ mộng! Buổi tối ngồi ngắm sông rất tuyệt vời.',
    },
    {
      post: posts[0]._id,
      author: users[2]._id,
      rating: 4,
      comment: 'Nơi này rất đông khách du lịch nhưng vẫn đẹp và đáng đến.',
    },
    {
      post: posts[1]._id,
      author: users[0]._id,
      rating: 5,
      comment: 'Hội An quá đẹp! Đặc biệt buổi tối với đèn lồng rực rỡ.',
    },
    {
      post: posts[1]._id,
      author: users[2]._id,
      rating: 5,
      comment: 'Di sản văn hóa thế giới xứng đáng! Cảo ẩm thực cũng tuyệt vời.',
    },
    {
      post: posts[1]._id,
      author: users[3]._id,
      rating: 4,
      comment: 'Đẹp nhưng hơi đông và nóng. Nên đi vào mùa thu.',
    },
    {
      post: posts[2]._id,
      author: users[0]._id,
      rating: 4,
      comment: 'Bãi biển đẹp, cát trắng mịn. Đồi cát rất thú vị cho chụp ảnh!',
    },
    {
      post: posts[3]._id,
      author: users[1]._id,
      rating: 5,
      comment: 'Đà Lạt mùa hoa rực rỡ, khí hậu mát mẻ rất dễ chịu!',
    },
    {
      post: posts[3]._id,
      author: users[2]._id,
      rating: 4,
      comment: 'Đẹp lắm nhưng hay kẹt xe cuối tuần. Nên đi ngày thường.',
    },
  ]);

  console.log(`⭐ Created ${reviews.length} reviews`);

  console.log('\n─────────────────────────────────────────────');
  console.log('✅ Seed completed!\n');
  console.log('📧 Test accounts (password: Password@123):');
  users.forEach((u) => console.log(`   ${u.role.toUpperCase()}: ${u.email}`));
  console.log('─────────────────────────────────────────────\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
