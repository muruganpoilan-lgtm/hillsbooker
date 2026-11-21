import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'property_screen.dart';
import 'results_screen.dart';
import 'vehicles_screen.dart';

// What the guest is searching for. Passed from screen to screen.
class StayQuery {
  final String city;
  final DateTime checkIn;
  final DateTime checkOut;
  final int guests; // adults + children
  final int children; // how many of the guests are children
  const StayQuery({required this.city, required this.checkIn, required this.checkOut, required this.guests, this.children = 0});

  int get nights => nightsBetween(checkIn, checkOut);
  String get dates => '${prettyDay(checkIn)} to ${prettyDay(checkOut)}';
}

// "Explore the hills": each region shows its height above sea level (rounded, of the main town).
// alt 0 means sea level. Tapping a card searches the town in it that has the most stays.
class _Region {
  final String name;
  final String photo;
  final int alt;
  final List<String> towns;
  const _Region(this.name, this.photo, this.alt, this.towns);
}

const _regions = <_Region>[
  _Region('Nilgiri hills', 'ooty', 2240, ['Ooty', 'Coonoor', 'Kotagiri']),
  _Region('Kerala hills', 'munnar', 1600, ['Munnar', 'Wayanad', 'Thekkady']),
  _Region('Palani hills', 'kodaikanal', 2133, ['Kodaikanal']),
  _Region('Anamalai hills', 'valparai', 1193, ['Valparai']),
  _Region('Shevaroy hills', 'yercaud', 1515, ['Yercaud', 'Kolli Hills']),
  _Region('Coorg and Chikmagalur', 'coorg', 1170, ['Coorg', 'Chikmagalur']),
  _Region('Kerala backwaters', 'alleppey', 0, ['Alleppey', 'Kumarakom']),
];

// "Browse by property type": a real listing's photo when there is one, otherwise a hill photo.
const _types = <List<String>>[
  ['homestay', 'Homestays', 'wayanad'],
  ['hotel', 'Hotels', 'thekkady'],
  ['resort', 'Resorts', 'alleppey'],
  ['apartment', 'Apartments', 'kodaikanal'],
];

const _towns = ['Ooty', 'Munnar', 'Kodaikanal', 'Valparai', 'Kotagiri', 'Coonoor', 'Coorg', 'Wayanad', 'Yercaud', 'Thekkady', 'Alleppey', 'Goa'];

// The owner offer line in the strip under the search shows until this date, then hides by itself.
final _ownerOfferUntil = DateTime(2026, 11, 30);

const _site = 'https://hillbooker.com';
const _tea = Color(0xFFDFF1E4);

// How-to videos on YouTube (same as the website's "How it works" section).
const _helpVideos = <List<String>>[
  ['pyGR3ENlvFA', 'How to book a stay', 'For guests'],
  ['G2ZzIaL7wDc', 'Create an account and log in', 'For guests and hosts'],
  ['2Fgjwkp3DDE', 'How to list your property', 'For hosts'],
  ['rHcYPeFLXzU', 'How Hill Booker works and how hosts earn', 'For hosts'],
];

const _deep = Color(0xFF0A5042);

const _why = <List<String>>[
  ['Pay only 30% to book', 'Pay a small advance online and the rest at the property.'],
  ['Rooms that are really free', 'Every result is open on all of your nights.'],
  ['Room held for you', 'We hold it for 10 minutes while you pay.'],
  ['Safe online payment', 'UPI, cards and net banking, secured by Razorpay.'],
];

const _hostPoints = [
  'Free to list, commission only on confirmed bookings',
  'Guests pay 30% online, so fewer no-shows',
  'WhatsApp alert for every booking',
  'Free hotel management software: rooms, walk-in guests, staff and expenses',
];

String _altText(int m) {
  if (m <= 0) return 'Sea level';
  final s = m.toString();
  return s.length > 3 ? '${s.substring(0, s.length - 3)},${s.substring(s.length - 3)} m' : '$s m';
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _city = TextEditingController();
  late DateTime _checkIn;
  late DateTime _checkOut;
  int _adults = 2;
  int _children = 0;
  String _error = '';
  // From the server: stays per town, per type (with a photo), and listed stays. Empty until loaded.
  Map<String, int> _cityCount = {};
  Map<String, dynamic> _typeInfo = {};
  List<Map<String, dynamic>> _stays = [];

  @override
  void initState() {
    super.initState();
    final t = today();
    _checkIn = t.add(const Duration(days: 2));
    _checkOut = t.add(const Duration(days: 3));
    _loadShowcase();
  }

  Future<void> _loadShowcase() async {
    final res = await Api.get('/home/showcase');
    if (!mounted || !res.ok || res.data is! Map) return;
    final d = res.data as Map;
    setState(() {
      _cityCount = {for (final e in ((d['cities'] as Map?) ?? {}).entries) '${e.key}': (e.value as num).toInt()};
      _typeInfo = Map<String, dynamic>.from((d['types'] as Map?) ?? {});
      _stays = [for (final x in ((d['stays'] as List?) ?? [])) Map<String, dynamic>.from(x as Map)];
    });
  }

  int _count(String town) => _cityCount[town.toLowerCase()] ?? 0;

  StayQuery _query(String city) =>
      StayQuery(city: city.trim(), checkIn: _checkIn, checkOut: _checkOut, guests: _adults + _children, children: _children);

  @override
  void dispose() {
    _city.dispose();
    super.dispose();
  }

  Future<void> _pickIn() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _checkIn,
      firstDate: today(),
      lastDate: today().add(const Duration(days: 365)),
      helpText: 'Check-in',
    );
    if (picked == null) return;
    setState(() {
      _checkIn = picked;
      if (!_checkOut.isAfter(picked)) _checkOut = picked.add(const Duration(days: 1));
    });
  }

  Future<void> _pickOut() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _checkOut,
      firstDate: _checkIn.add(const Duration(days: 1)),
      lastDate: today().add(const Duration(days: 400)),
      helpText: 'Check-out',
    );
    if (picked != null) setState(() => _checkOut = picked);
  }

  void _search(String city, {String type = ''}) {
    if (!_checkOut.isAfter(_checkIn)) {
      setState(() => _error = 'Check-out must be after check-in.');
      return;
    }
    setState(() => _error = '');
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ResultsScreen(query: _query(city), initialType: type)));
  }

  @override
  Widget build(BuildContext context) {
    final nights = nightsBetween(_checkIn, _checkOut);
    final showDeal = !today().isAfter(_ownerOfferUntil);
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        _hero(),
        Transform.translate(
          offset: const Offset(0, -44),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: _slip(nights)),
              Padding(padding: const EdgeInsets.fromLTRB(16, 14, 16, 0), child: _ownersStrip(showDeal)),
              _sectionTitle('Explore the hills', 'The number on each card is the height above sea level. Higher means cooler.'),
              _regionRow(),
              _sectionTitle('Browse by property type', null),
              _typeRow(),
              if (_stays.isNotEmpty) ...[
                _sectionTitle('Stays guests love', 'Hand-picked hotels and homestays listed on Hill Booker'),
                _staysRow(),
              ],
              _sectionTitle('Plan the whole trip', null),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(children: [
                  _tripTile(
                    main: true,
                    title: 'Plan my trip',
                    text: 'Tell us your dates and budget. Get a stay, a cab and a day-by-day plan in seconds.',
                    cta: 'Plan my trip',
                    onTap: () => _open('$_site/plan-trip'),
                  ),
                  const SizedBox(height: 10),
                  _tripTile(
                    title: 'Cars and vans',
                    text: 'A car, van or bus with a driver, for pickup and sightseeing.',
                    cta: 'See cars and vans',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => VehiclesScreen(city: _city.text.trim()))),
                  ),
                  const SizedBox(height: 10),
                  _tripTile(
                    title: 'Group and corporate tours',
                    text: "Big group or office trip? Tell us what you need and we'll call with a quote.",
                    cta: 'Ask for a quote',
                    onTap: () => _open('$_site/enquiry?kind=group'),
                  ),
                ]),
              ),
              _sectionTitle('Why book with Hill Booker', null),
              for (final w in _why)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(w[0], style: display(16)),
                    const SizedBox(height: 2),
                    Text(w[1], style: const TextStyle(color: C.soft, fontSize: 13.5)),
                  ]),
                ),
              _sectionTitle('How it works', 'Short videos to help you get started'),
              for (final v in _helpVideos) _videoCard(v[0], v[1], v[2]),
              _sectionTitle('Popular towns', null),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final c in _popularTowns())
                      ActionChip(
                        label: Text(c),
                        backgroundColor: Colors.white,
                        side: const BorderSide(color: C.line),
                        shape: const StadiumBorder(),
                        onPressed: () => _search(c),
                      ),
                  ],
                ),
              ),
              Padding(padding: const EdgeInsets.fromLTRB(16, 24, 16, 24), child: _hostBand()),
            ],
          ),
        ),
      ],
    );
  }

  // Hero: the Munnar tea-hills photo from the website, darkened at the bottom so the words stay readable.
  Widget _hero() {
    return SizedBox(
      height: 380,
      child: Stack(fit: StackFit.expand, children: [
        Container(color: _deep),
        Image.network('$_site/hero/munnar-720.webp', fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink()),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x330A3F34), Color(0x400A3F34), Color(0xDB0A3F34)],
              stops: [0, 0.45, 1],
            ),
          ),
        ),
        SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 64),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0xFFFAF9F4), borderRadius: BorderRadius.circular(8)),
                  child: Image.asset('assets/logo_mark.png', height: 26),
                ),
                const SizedBox(width: 10),
                Text('Hill Booker', style: display(18, color: Colors.white)),
              ]),
              const Spacer(),
              Text('Stay up in the hills', style: display(36, color: Colors.white)),
              const SizedBox(height: 8),
              const Text(
                'Homestays, cottages and hotels in Ooty, Munnar, Kodaikanal, Valparai and more. Pay 30% to book, the rest when you arrive.',
                style: TextStyle(color: Color(0xFFE8F2EE), fontSize: 14.5, height: 1.4),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _ownersStrip(bool showDeal) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: _tea, borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text.rich(TextSpan(style: const TextStyle(color: C.ink, fontSize: 14.5, height: 1.4), children: [
          const TextSpan(text: 'Own a homestay or hotel in the hills? ', style: TextStyle(fontWeight: FontWeight.w700)),
          const TextSpan(text: 'List it free and pay only when you get a booking.'),
          if (showDeal)
            const TextSpan(text: ' Deepavali offer: 5% commission if you list by 30 Nov.', style: TextStyle(color: _deep, fontWeight: FontWeight.w600)),
        ])),
        const SizedBox(height: 10),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: _deep, minimumSize: const Size(0, 42)),
          onPressed: () => _open('$_site/register'),
          child: const Text('List your property'),
        ),
      ]),
    );
  }

  Widget _regionRow() {
    return SizedBox(
      height: 250,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _regions.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final r = _regions[i];
          final n = r.towns.fold<int>(0, (sum, t) => sum + _count(t));
          var best = r.towns.first;
          for (final t in r.towns) {
            if (_count(t) > _count(best)) best = t;
          }
          return InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => _search(best),
            child: Container(
              width: 186,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(color: _deep, borderRadius: BorderRadius.circular(14)),
              child: Stack(fit: StackFit.expand, children: [
                Image.network('$_site/cities/${r.photo}.webp', fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink()),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0x00000000), Color(0xE0062821)],
                      stops: [0.35, 1],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_altText(r.alt), style: display(30, color: Colors.white)),
                    const SizedBox(height: 4),
                    Text(r.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
                    Text(
                      r.towns.join(', ') + (n > 0 ? ' · ${plural(n, 'stay')}' : ''),
                      style: const TextStyle(color: Color(0xFFD8E8E2), fontSize: 12.5),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ]),
                ),
              ]),
            ),
          );
        },
      ),
    );
  }

  Widget _photoCard({required String? photoUrl, required String fallback, required String seed, required List<Widget> lines, required VoidCallback onTap}) {
    return SizedBox(
      width: 200,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              height: 150,
              width: 200,
              child: (photoUrl != null && photoUrl.isNotEmpty)
                  ? PhotoOrRidge(url: photoUrl, seed: seed)
                  : Image.network('$_site/cities/$fallback.webp', fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: C.line)),
            ),
          ),
          const SizedBox(height: 8),
          ...lines,
        ]),
      ),
    );
  }

  Widget _typeRow() {
    return SizedBox(
      height: 200,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _types.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final t = _types[i];
          final info = _typeInfo[t[0]];
          final count = info is Map ? ((info['count'] as num?) ?? 0).toInt() : 0;
          final photo = info is Map ? info['photo'] as String? : null;
          return _photoCard(
            photoUrl: photo,
            fallback: t[2],
            seed: t[0],
            onTap: () => _search('', type: t[0]),
            lines: [
              Text(t[1], style: display(16)),
              if (count > 0) Text(plural(count, 'stay'), style: const TextStyle(color: C.soft, fontSize: 13)),
            ],
          );
        },
      ),
    );
  }

  Widget _staysRow() {
    return SizedBox(
      height: 250,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _stays.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final p = _stays[i];
          final id = '${p['id']}';
          final rated = ((p['rating_count'] as num?) ?? 0) > 0;
          final price = p['price_from'] as num?;
          return _photoCard(
            photoUrl: p['photo'] as String?,
            fallback: '${p['city']}'.toLowerCase(),
            seed: id,
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PropertyScreen(propertyId: id, query: _query('')))),
            lines: [
              Text('${p['name']}', style: display(15.5), maxLines: 1, overflow: TextOverflow.ellipsis),
              Text('${typeLabel('${p['type']}')} in ${p['city']}', style: const TextStyle(color: C.soft, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                rated ? '★ ${((p['rating_avg'] as num?) ?? 0).toStringAsFixed(1)} · ${plural((p['rating_count'] as num).toInt(), 'review')}' : 'New on Hill Booker',
                style: TextStyle(color: rated ? C.soft : C.green, fontWeight: rated ? FontWeight.w400 : FontWeight.w700, fontSize: 13),
              ),
              if (price != null && price > 0) Text('From ${money(price)} a night', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            ],
          );
        },
      ),
    );
  }

  Widget _tripTile({bool main = false, required String title, required String text, required String cta, required VoidCallback onTap}) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: main ? C.green : Colors.white,
          border: Border.all(color: main ? C.green : C.line),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: display(18, color: main ? Colors.white : C.ink)),
          const SizedBox(height: 4),
          Text(text, style: TextStyle(color: main ? const Color(0xFFD9ECE5) : C.soft, fontSize: 14, height: 1.35)),
          const SizedBox(height: 10),
          Text(cta, style: TextStyle(color: main ? C.gold : C.green, fontWeight: FontWeight.w700)),
        ]),
      ),
    );
  }

  List<String> _popularTowns() {
    final out = <String>[];
    for (final t in _towns) {
      out.add(t);
    }
    // any other town where an owner has listed, most stays first
    final extra = _cityCount.entries.where((e) => !_towns.any((t) => t.toLowerCase() == e.key)).toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    for (final e in extra) {
      out.add(e.key.split(' ').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' '));
    }
    return out;
  }

  Widget _hostBand() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: _deep, borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Own a hotel or homestay in the hills?', style: display(20, color: Colors.white)),
        const SizedBox(height: 6),
        const Text(
          'Guests on Hill Booker are looking for exactly your kind of place. You set the prices and choose which nights to sell.',
          style: TextStyle(color: Color(0xFFCFE3DC), fontSize: 14, height: 1.4),
        ),
        const SizedBox(height: 12),
        for (final pt in _hostPoints)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(margin: const EdgeInsets.only(top: 6), width: 9, height: 9, decoration: const BoxDecoration(color: C.gold, shape: BoxShape.circle)),
              const SizedBox(width: 10),
              Expanded(child: Text(pt, style: const TextStyle(color: Colors.white, fontSize: 14))),
            ]),
          ),
        const SizedBox(height: 6),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: C.gold, foregroundColor: C.ink),
          onPressed: () => _open('$_site/register'),
          child: const Text('List your property'),
        ),
      ]),
    );
  }

  Widget _sectionTitle(String title, String? lead) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: display(22)),
        if (lead != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(lead, style: const TextStyle(color: C.soft, fontSize: 14))),
      ]),
    );
  }

  Future<void> _open(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the link. Please try again.')));
    }
  }

  Widget _videoCard(String id, String title, String forWho) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => _open('https://www.youtube.com/watch?v=$id'),
        child: Container(
          decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(10)),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 16 / 9,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(
                      'https://img.youtube.com/vi/$id/hqdefault.jpg',
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(color: C.green),
                    ),
                    const Center(child: Icon(Icons.play_circle_fill, color: Colors.white, size: 56)),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: display(16)),
                    const SizedBox(height: 2),
                    Text(forWho, style: const TextStyle(color: C.soft, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _slip(int nights) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: C.gold, width: 3),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _city,
            textInputAction: TextInputAction.search,
            onSubmitted: _search,
            decoration: fieldDeco('City', hint: 'Valparai, Ooty, Goa', prefix: const Icon(Icons.place_outlined)),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _dateTile('Check-in', _checkIn, _pickIn)),
              const SizedBox(width: 10),
              Expanded(child: _dateTile('Check-out', _checkOut, _pickOut)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              const Text('Adults', style: TextStyle(fontWeight: FontWeight.w700, color: C.soft)),
              const Spacer(),
              IconButton(
                onPressed: _adults > 1 ? () => setState(() => _adults--) : null,
                icon: const Icon(Icons.remove_circle_outline),
                tooltip: 'Fewer adults',
              ),
              SizedBox(width: 24, child: Text('$_adults', textAlign: TextAlign.center, style: display(18))),
              IconButton(
                onPressed: _adults + _children < 20 ? () => setState(() => _adults++) : null,
                icon: const Icon(Icons.add_circle_outline),
                tooltip: 'More adults',
              ),
            ],
          ),
          Row(
            children: [
              const Text('Children', style: TextStyle(fontWeight: FontWeight.w700, color: C.soft)),
              const Spacer(),
              IconButton(
                onPressed: _children > 0 ? () => setState(() => _children--) : null,
                icon: const Icon(Icons.remove_circle_outline),
                tooltip: 'Fewer children',
              ),
              SizedBox(width: 24, child: Text('$_children', textAlign: TextAlign.center, style: display(18))),
              IconButton(
                onPressed: _adults + _children < 20 ? () => setState(() => _children++) : null,
                icon: const Icon(Icons.add_circle_outline),
                tooltip: 'More children',
              ),
            ],
          ),
          if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(_error, style: const TextStyle(color: C.brick, fontWeight: FontWeight.w600))),
          FilledButton(onPressed: () => _search(_city.text), child: const Text('Search rooms')),
          const SizedBox(height: 8),
          Text(
            '${plural(nights < 1 ? 1 : nights, 'night')}. We only show rooms that are free on every night.',
            style: const TextStyle(color: C.soft, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _dateTile(String label, DateTime value, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFAAB5AC)),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: C.soft)),
            const SizedBox(height: 2),
            Text(prettyDayYear(value), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
