import {
  Utensils,
  Coffee,
  Pizza,
  Wine,
  Beer,
  Apple,
  Cake,
  Car,
  Bus,
  Train,
  Plane,
  Bike,
  Fuel,
  Compass,
  MapPin,
  Ticket,
  Luggage,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Shirt,
  Watch,
  Gift,
  Glasses,
  Gem,
  Package,
  Sparkles,
  Zap,
  Flame,
  Droplet,
  Wifi,
  Smartphone,
  Laptop,
  Phone,
  Tv,
  Radio,
  Lightbulb,
  BatteryCharging,
  Film,
  Music,
  Gamepad2,
  Headphones,
  Camera,
  Dumbbell,
  Trophy,
  Palette,
  PartyPopper,
  HeartPulse,
  Pill,
  Stethoscope,
  Activity,
  Smile,
  Shield,
  Bath,
  Home,
  Key,
  Bed,
  Armchair,
  Wrench,
  Hammer,
  Scissors,
  Dog,
  Cat,
  Trees,
  Flower2,
  Briefcase,
  Book,
  GraduationCap,
  Building,
  Landmark,
  PiggyBank,
  DollarSign,
  CreditCard,
  Receipt,
  Wallet,
  Award,
  Calculator,
  Baby,
  SmilePlus,
  MoreHorizontal
} from 'lucide-react';

export interface IconItem {
  name: string;
  component: any;
  label: string;
  category: 'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'leisure' | 'home' | 'finance' | 'work';
  keywords: string;
}

export const ICON_CATALOG: IconItem[] = [
  // Food & Drinks
  { name: 'Utensils', component: Utensils, label: 'Dining / Food', category: 'food', keywords: 'food dinner lunch meal restaurant eat kitchen' },
  { name: 'Coffee', component: Coffee, label: 'Coffee / Tea', category: 'food', keywords: 'coffee tea cafe drink snack starbucks brew' },
  { name: 'Pizza', component: Pizza, label: 'Fast Food', category: 'food', keywords: 'pizza fastfood junk slice takeout delivery' },
  { name: 'Wine', component: Wine, label: 'Bar & Wine', category: 'food', keywords: 'wine bar alcohol pub party drink bottle' },
  { name: 'Beer', component: Beer, label: 'Beer & Cheers', category: 'food', keywords: 'beer mug pub drink night party brewery' },
  { name: 'Apple', component: Apple, label: 'Groceries / Fruit', category: 'food', keywords: 'apple grocery fruit fresh vegetable healthy supermarket' },
  { name: 'Cake', component: Cake, label: 'Bakery / Cake', category: 'food', keywords: 'cake sweet bakery dessert birthday celebration treat' },

  // Transport & Travel
  { name: 'Car', component: Car, label: 'Car & Auto', category: 'transport', keywords: 'car auto drive parking vehicle toll uber' },
  { name: 'Fuel', component: Fuel, label: 'Fuel / Gas', category: 'transport', keywords: 'fuel gas petrol diesel pump station oil' },
  { name: 'Bike', component: Bike, label: 'Bike / Scooter', category: 'transport', keywords: 'bike bicycle ride cycling commute scooter motorbike' },
  { name: 'Bus', component: Bus, label: 'Bus & Transit', category: 'transport', keywords: 'bus public transit coach commute ticket' },
  { name: 'Train', component: Train, label: 'Train & Metro', category: 'transport', keywords: 'train railway metro subway transit station' },
  { name: 'Plane', component: Plane, label: 'Flight / Travel', category: 'transport', keywords: 'plane flight airport holiday travel tour trip vacation' },
  { name: 'Luggage', component: Luggage, label: 'Vacation / Trip', category: 'transport', keywords: 'luggage baggage hotel resort holiday travel stay' },
  { name: 'Compass', component: Compass, label: 'Adventure', category: 'transport', keywords: 'compass explore travel camp outdoor guide' },
  { name: 'MapPin', component: MapPin, label: 'Location', category: 'transport', keywords: 'location destination spot visit trip' },

  // Shopping & Fashion
  { name: 'ShoppingBag', component: ShoppingBag, label: 'Shopping', category: 'shopping', keywords: 'shopping bag retail store mall buy goods' },
  { name: 'ShoppingCart', component: ShoppingCart, label: 'Cart / Mart', category: 'shopping', keywords: 'cart supermarket market grocery checkout online' },
  { name: 'Shirt', component: Shirt, label: 'Clothing / Fashion', category: 'shopping', keywords: 'shirt clothes fashion dress wear apparel outfit pants' },
  { name: 'Watch', component: Watch, label: 'Jewelry / Luxury', category: 'shopping', keywords: 'watch clock jewelry luxury time accessory gold' },
  { name: 'Gift', component: Gift, label: 'Gifts & Donates', category: 'shopping', keywords: 'gift present birthday charity donation celebration treat' },
  { name: 'Gem', component: Gem, label: 'Jewelry & Gem', category: 'shopping', keywords: 'gem diamond jewelry luxury gold ring stone' },
  { name: 'Package', component: Package, label: 'Courier / Orders', category: 'shopping', keywords: 'package parcel delivery amazon courier order box' },
  { name: 'Tag', component: Tag, label: 'General Goods', category: 'shopping', keywords: 'tag discount sale item brand purchase' },

  // Bills & Utilities
  { name: 'Zap', component: Zap, label: 'Electricity / Power', category: 'bills', keywords: 'zap electricity power bill energy lights utility' },
  { name: 'Droplet', component: Droplet, label: 'Water Bill', category: 'bills', keywords: 'water droplet utility supply plumbing aqua' },
  { name: 'Flame', component: Flame, label: 'Gas / Heating', category: 'bills', keywords: 'gas cylinder heating flame fire utility' },
  { name: 'Wifi', component: Wifi, label: 'Internet & WiFi', category: 'bills', keywords: 'wifi internet broadband network data fiber router' },
  { name: 'Phone', component: Phone, label: 'Mobile Recharge', category: 'bills', keywords: 'phone mobile recharge call sim telecom bill' },
  { name: 'Tv', component: Tv, label: 'TV & Streaming', category: 'bills', keywords: 'tv television cable netflix streaming subscription dth' },
  { name: 'Lightbulb', component: Lightbulb, label: 'Maintenance', category: 'bills', keywords: 'lightbulb idea repair upkeep utility service' },

  // Health & Personal Care
  { name: 'HeartPulse', component: HeartPulse, label: 'Healthcare', category: 'health', keywords: 'medical health heart clinic doctor appointment checkup' },
  { name: 'Pill', component: Pill, label: 'Pharmacy / Medicine', category: 'health', keywords: 'pill medicine pharmacy drug tablets capsule prescription' },
  { name: 'Stethoscope', component: Stethoscope, label: 'Doctor / Hospital', category: 'health', keywords: 'doctor hospital clinic specialist consultation surgery' },
  { name: 'Dumbbell', component: Dumbbell, label: 'Gym & Fitness', category: 'health', keywords: 'gym fitness workout exercise muscle training health sports' },
  { name: 'Activity', component: Activity, label: 'Sports & Active', category: 'health', keywords: 'sports exercise running jogging cardio tracker' },
  { name: 'Smile', component: Smile, label: 'Salon & Spa', category: 'health', keywords: 'salon spa haircut barber beauty care facial massage' },
  { name: 'Shield', component: Shield, label: 'Insurance', category: 'health', keywords: 'insurance health life policy coverage security protect' },

  // Home & Family
  { name: 'Home', component: Home, label: 'House & Rent', category: 'home', keywords: 'home house rent room apartment mortgage property stay' },
  { name: 'Key', component: Key, label: 'Rent & Lease', category: 'home', keywords: 'key rental deposit lease realestate lock' },
  { name: 'Bed', component: Bed, label: 'Furniture', category: 'home', keywords: 'bed furniture decor mattress sleep living room' },
  { name: 'Wrench', component: Wrench, label: 'Repairs & Tools', category: 'home', keywords: 'wrench repair tool mechanic plumber handyman fix' },
  { name: 'Dog', component: Dog, label: 'Pets & Vet', category: 'home', keywords: 'pet dog cat animal vet puppy veterinary animal food' },
  { name: 'Cat', component: Cat, label: 'Pet Care', category: 'home', keywords: 'cat pet kitten feline vet shelter food' },
  { name: 'Baby', component: Baby, label: 'Baby & Kids', category: 'home', keywords: 'baby child kids toddler toys diapers childcare nursery' },
  { name: 'Trees', component: Trees, label: 'Garden & Plants', category: 'home', keywords: 'garden plants trees nature yard landscaping lawn' },

  // Leisure & Entertainment
  { name: 'Film', component: Film, label: 'Movies & Cinema', category: 'leisure', keywords: 'film movie cinema tickets theater show series' },
  { name: 'Music', component: Music, label: 'Music & Concerts', category: 'leisure', keywords: 'music song concert spotify audio festival album' },
  { name: 'Gamepad2', component: Gamepad2, label: 'Gaming', category: 'leisure', keywords: 'gaming game steam playstation console xbox arcade' },
  { name: 'Camera', component: Camera, label: 'Photography', category: 'leisure', keywords: 'camera photo photography gear lens shoot video' },
  { name: 'Palette', component: Palette, label: 'Art & Hobbies', category: 'leisure', keywords: 'art hobby painting craft design drawing creative' },
  { name: 'Trophy', component: Trophy, label: 'Tournaments', category: 'leisure', keywords: 'trophy tournament prize match league victory competition' },
  { name: 'PartyPopper', component: PartyPopper, label: 'Events & Parties', category: 'leisure', keywords: 'party celebration event birthday festival carnival fun' },

  // Work, Education & Finance
  { name: 'Briefcase', component: Briefcase, label: 'Work & Business', category: 'work', keywords: 'work job office business company salary client profession' },
  { name: 'Book', component: Book, label: 'Books & Reading', category: 'work', keywords: 'book library study novel reading stationery' },
  { name: 'GraduationCap', component: GraduationCap, label: 'Education & Tuition', category: 'work', keywords: 'education school college university tuition course classes fee' },
  { name: 'Laptop', component: Laptop, label: 'Tech & Gadgets', category: 'work', keywords: 'laptop computer tech electronics gadgets hardware software' },
  { name: 'PiggyBank', component: PiggyBank, label: 'Savings & Invest', category: 'finance', keywords: 'savings invest gold bank deposit funds money interest' },
  { name: 'Landmark', component: Landmark, label: 'Bank & Taxes', category: 'finance', keywords: 'bank taxes government legal fee institution court' },
  { name: 'CreditCard', component: CreditCard, label: 'Card & EMIs', category: 'finance', keywords: 'card bank credit debit loan emi installment' },
  { name: 'Receipt', component: Receipt, label: 'Bills & Dues', category: 'finance', keywords: 'receipt bill tax payment invoice dues charges' },
  { name: 'Calculator', component: Calculator, label: 'Accounting', category: 'finance', keywords: 'calculator audit tax calculation finance expense' },
];

export const ICON_MAP: Record<string, any> = {
  Utensils,
  Car,
  ShoppingBag,
  Zap,
  Film,
  GraduationCap,
  MoreHorizontal,
  ...Object.fromEntries(ICON_CATALOG.map((i) => [i.name, i.component]))
};

export const getCategoryIcon = (iconName?: string) => {
  if (!iconName) return Tag;
  return ICON_MAP[iconName] || Tag;
};
