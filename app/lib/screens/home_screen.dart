import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
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

// Roughly how high each place sits above the sea, in metres.
const _places = <MapEntry<String, int>>[
  MapEntry('Ooty', 2240),
  MapEntry('Kodaikanal', 2130),
  MapEntry('Munnar', 1530),
  MapEntry('Yercaud', 1500),
  MapEntry('Coorg', 1150),
  MapEntry('Valparai', 1050),
  MapEntry('Thekkady', 900),
  MapEntry('Wayanad', 800),
  MapEntry('Alleppey', 0),
  MapEntry('Kovalam', 0),
  MapEntry('Varkala', 0),
  MapEntry('Pondicherry', 0),
  MapEntry('Goa', 0),
];

// Popular places shown as coloured tiles, like the website. Tap one to search it.
const _trending = <List<Object>>[
  ['Munnar', 'Tea hills', Color(0xFF0E6B58), Color(0xFF3F9A7F)],
  ['Ooty', 'Nilgiri hills', Color(0xFF2A3A7A), Color(0xFF5A6FB8)],
  ['Goa', 'Beaches', Color(0xFFB3512B), Color(0xFFE89A5A)],
  ['Coorg', 'Coffee estates', Color(0xFF7A4B1F), Color(0xFFC08A4D)],
  ['Alleppey', 'Backwaters', Color(0xFF0B5F7A), Color(0xFF4AA7C4)],
  ['Kodaikanal', 'Lake and mist', Color(0xFF4B3A7A), Color(0xFF8D77C4)],
  ['Valparai', 'Quiet hills', Color(0xFF0A5042), Color(0xFF2F8F78)],
];

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

  @override
  void initState() {
    super.initState();
    final t = today();
    _checkIn = t.add(const Duration(days: 2));
    _checkOut = t.add(const Duration(days: 3));
  }

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

  void _search(String city) {
    if (!_checkOut.isAfter(_checkIn)) {
      setState(() => _error = 'Check-out must be after check-in.');
      return;
    }
    setState(() => _error = '');
    final q = StayQuery(city: city.trim(), checkIn: _checkIn, checkOut: _checkOut, guests: _adults + _children, children: _children);
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ResultsScreen(query: q)));
  }

  @override
  Widget build(BuildContext context) {
    final nights = nightsBetween(_checkIn, _checkOut);
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // Hero: deep green, like the website.
        Container(
          color: _deep,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 64),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(color: const Color(0xFFFAF9F4), borderRadius: BorderRadius.circular(8)),
                      child: Image.asset('assets/logo_mark.png', height: 26),
                    ),
                    const SizedBox(width: 10),
                    Text('Hill Booker', style: display(18, color: Colors.white)),
                  ]),
                  const SizedBox(height: 22),
                  Text('Find your next stay', style: display(34, color: Colors.white)),
                  const SizedBox(height: 8),
                  const Text(
                    'Hill stations, backwaters and beaches across South India. Rooms and homestays from hosts you can book in minutes.',
                    style: TextStyle(color: Color(0xFFDCECE6), fontSize: 14.5, height: 1.4),
                  ),
                ],
              ),
            ),
          ),
        ),
        Transform.translate(
          offset: const Offset(0, -44),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: _slip(nights)),
              _sectionTitle('Offers', 'Simple ways to book with Hill Booker'),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _offerCard(
                  color: C.green,
                  title: 'Book with just 30%',
                  text: 'Pay a small advance to confirm. Pay the rest when you reach the stay.',
                  button: 'Find a stay',
                  textOnButton: Colors.white,
                  onTap: () => _search(_city.text),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: _offerCard(
                  color: C.gold,
                  title: 'Need a ride too?',
                  text: 'Need a car, van or bus with a driver? Tell us your trip and we will arrange it.',
                  button: 'Cars and vans',
                  textOnButton: C.ink,
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => VehiclesScreen(city: _city.text.trim()))),
                ),
              ),
              _sectionTitle('Group and corporate tours', 'Travelling with a big group or your team? Tell us what you need and we will call you with a quote.'),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(children: [
                  Expanded(child: FilledButton(onPressed: () => _open('https://hillbooker.com/enquiry?kind=group'), child: const Text('Group tour'))),
                  const SizedBox(width: 10),
                  Expanded(child: FilledButton(onPressed: () => _open('https://hillbooker.com/enquiry?kind=corporate'), child: const Text('Corporate tour'))),
                ]),
              ),
              _sectionTitle('Trending destinations', 'Popular places to stay'),
              _trendingRow(),
              _sectionTitle('More places to explore', null),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final p in _places)
                      ActionChip(
                        label: Text(p.key),
                        backgroundColor: Colors.white,
                        side: const BorderSide(color: C.line),
                        onPressed: () => _search(p.key),
                      ),
                  ],
                ),
              ),
              _sectionTitle('How it works', 'Short videos to help you get started'),
              for (final v in _helpVideos) _videoCard(v[0], v[1], v[2]),
              _sectionTitle('Why book with Hill Booker', null),
              for (final w in _why)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Padding(padding: EdgeInsets.only(top: 2), child: Icon(Icons.check_circle, color: C.green, size: 20)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(w[0], style: display(16)),
                        Text(w[1], style: const TextStyle(color: C.soft, fontSize: 13.5)),
                      ]),
                    ),
                  ]),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(color: _deep, borderRadius: BorderRadius.circular(12)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Own a hotel or homestay?', style: display(20, color: Colors.white)),
                    const SizedBox(height: 6),
                    const Text('Add your rooms and photos, open the nights you want to sell, and set your own prices.', style: TextStyle(color: Color(0xFFDCECE6), fontSize: 14)),
                    const SizedBox(height: 12),
                    FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: C.gold, foregroundColor: C.ink),
                      onPressed: () => _open('https://hillbooker.com/register'),
                      child: const Text('List your property'),
                    ),
                  ]),
                ),
              ),
            ],
          ),
        ),
      ],
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

  Widget _offerCard({required Color color, required String title, required String text, required String button, required Color textOnButton, required VoidCallback onTap}) {
    return Container(
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(10)),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(width: 8, color: color),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: display(19)),
                const SizedBox(height: 4),
                Text(text, style: const TextStyle(color: C.soft, fontSize: 14, height: 1.35)),
                const SizedBox(height: 12),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: color, foregroundColor: textOnButton),
                  onPressed: onTap,
                  child: Text(button),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  Future<void> _open(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the link. Please try again.')));
    }
  }

  Widget _trendingRow() {
    return SizedBox(
      height: 120,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _trending.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          final t = _trending[i];
          return InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => _search(t[0] as String),
            child: Container(
              width: 150,
              padding: const EdgeInsets.all(12),
              alignment: Alignment.bottomLeft,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [t[2] as Color, t[3] as Color]),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t[0] as String, style: display(19, color: Colors.white)),
                  Text(t[1] as String, style: const TextStyle(color: Color(0xFFEAF3EF), fontSize: 13)),
                ],
              ),
            ),
          );
        },
      ),
    );
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
