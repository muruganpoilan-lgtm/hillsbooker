import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'bill_screen.dart';
import 'guest_form.dart';
import 'hotel_common.dart';

// The guest register: everyone who stayed or is due to stay, whether they booked
// through Hill Booker or walked in. Filter by dates, search by name, and open any
// guest to see their ID proof, vehicle and bill.

class GuestsSection extends StatefulWidget {
  final String propertyId;
  const GuestsSection({super.key, required this.propertyId});

  @override
  State<GuestsSection> createState() => _GuestsSectionState();
}

class _GuestsSectionState extends State<GuestsSection> {
  List<Map<String, dynamic>> _guests = [];
  Map<String, dynamic> _totals = {};
  DateTime _from = today().subtract(const Duration(days: 30));
  DateTime _to = today().add(const Duration(days: 60));
  String _search = '';
  String _who = 'all'; // all, staying, hillbooker, walkin, owing
  bool _loading = true;
  String _error = '';

  final TextEditingController _searchBox = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchBox.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final res = await Api.get('/hotel/${widget.propertyId}/guests', query: {
      'from': isoDate(_from),
      'to': isoDate(_to),
    });
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _loading = false;
        _error = res.error;
      });
      return;
    }
    final d = rowMap(res.data);
    setState(() {
      _loading = false;
      _error = '';
      _guests = rowList(d['guests']);
      _totals = rowMap(d['totals']);
    });
  }

  bool _staying(Map<String, dynamic> g) {
    if (text(g['checked_out_at']).isNotEmpty) return false;
    final inDay = tryDay(g['check_in']);
    final outDay = tryDay(g['check_out']);
    if (inDay == null || outDay == null) return false;
    final t = today();
    return !inDay.isAfter(t) && !outDay.isBefore(t);
  }

  List<Map<String, dynamic>> get _shown {
    final q = _search.trim().toLowerCase();
    return _guests.where((g) {
      if (q.isNotEmpty) {
        final hay = '${g['name']} ${g['phone']} ${g['room']} ${g['vehicle_number']}'.toLowerCase();
        if (!hay.contains(q)) return false;
      }
      switch (_who) {
        case 'staying':
          return _staying(g);
        case 'hillbooker':
          return text(g['source']) == 'hillbooker';
        case 'walkin':
          return text(g['source']) == 'walkin';
        case 'owing':
          return toNum(g['balance']) > 0;
        default:
          return true;
      }
    }).toList();
  }

  Future<void> _pickRange() async {
    final picked = await showDateRangePicker(
      context: context,
      initialDateRange: DateTimeRange(start: _from, end: _to),
      firstDate: DateTime(today().year - 3),
      lastDate: DateTime(today().year + 3),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _from = DateTime(picked.start.year, picked.start.month, picked.start.day);
      _to = DateTime(picked.end.year, picked.end.month, picked.end.day);
      _loading = true;
    });
    await _load();
  }

  Future<void> _checkOut(Map<String, dynamic> g) async {
    final balance = toNum(g['balance']);
    final yes = await askYesNo(
      context,
      'Check out?',
      balance > 0
          ? 'There is still ${money(balance)} to collect from ${g['name']}. Check out anyway?'
          : '${g['name']} will be checked out and the room goes to Cleaning.',
      'Check out',
    );
    if (!yes || !mounted) return;
    final id = text(g['id']);
    final path = text(g['source']) == 'walkin' ? '/hotel/guests/$id/checkout' : '/hotel/bookings/$id/checkout';
    final res = await Api.post(path);
    if (!mounted) return;
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: C.green));
    if (_error.isNotEmpty) {
      return ErrorBox(title: "We couldn't load your guests", message: _error, onRetry: _load);
    }

    final shown = _shown;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 36),
        children: [
          FilledButton.icon(
            onPressed: () async {
              final saved = await openGuestForm(context, propertyId: widget.propertyId);
              if (saved && mounted) await _load();
            },
            icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
            label: const Text('Add a direct guest'),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _searchBox,
            onChanged: (v) => setState(() => _search = v),
            decoration: fieldDeco(
              'Search',
              hint: 'Name, phone, room or number plate',
              prefix: const Icon(Icons.search, size: 20),
              suffix: _search.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () {
                        _searchBox.clear();
                        setState(() => _search = '');
                      },
                    ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _filterChip('all', 'Everyone'),
                _filterChip('staying', 'Here now'),
                _filterChip('owing', 'Money due'),
                _filterChip('hillbooker', 'Hill Booker'),
                _filterChip('walkin', 'Direct'),
              ],
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _pickRange,
            icon: const Icon(Icons.date_range_outlined, size: 18),
            label: Text('${prettyDayYear(_from)} to ${prettyDayYear(_to)}'),
          ),
          const SizedBox(height: 14),
          HTotals(children: [
            HLine('Guests in these dates', qtyText(_totals['guests'])),
            HLine('Rooms and extras', money(toNum(_totals['total']))),
            HLine('Of that, extras', money(toNum(_totals['extras']))),
            HLine('Paid', money(toNum(_totals['paid']))),
            HLine(
              'Still to collect',
              money(toNum(_totals['balance'])),
              strong: true,
              color: toNum(_totals['balance']) > 0 ? C.brick : C.green,
            ),
          ]),
          const SizedBox(height: 6),
          if (shown.isEmpty)
            HEmpty(_guests.isEmpty
                ? 'No guests in these dates yet. Add a direct guest, or widen the dates.'
                : 'No guest matches that. Try another search or filter.')
          else
            Text('${plural(shown.length, 'guest')}', style: const TextStyle(color: C.soft, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          for (final g in shown) _guestCard(g),
        ],
      ),
    );
  }

  Widget _filterChip(String value, String label) {
    final on = _who == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        selected: on,
        onSelected: (_) => setState(() => _who = value),
        label: Text(label),
        labelStyle: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: on ? Colors.white : C.ink),
        selectedColor: C.green,
        backgroundColor: Colors.white,
        showCheckmark: false,
        visualDensity: VisualDensity.compact,
        side: BorderSide(color: on ? C.green : C.line),
      ),
    );
  }

  Widget _guestCard(Map<String, dynamic> g) {
    final walkin = text(g['source']) == 'walkin';
    final gone = text(g['checked_out_at']).isNotEmpty;
    final here = _staying(g);
    final balance = toNum(g['balance']);
    final nights = nightsBetween(tryDay(g['check_in']) ?? today(), tryDay(g['check_out']) ?? today());
    final photos = g['id_photos'] is List ? (g['id_photos'] as List).length : 0;

    return HCard(
      onTap: () async {
        final saved = await openGuestForm(context, propertyId: widget.propertyId, guest: g);
        if (saved && mounted) await _load();
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(text(g['name']), style: display(17)),
              if (text(g['phone']).isNotEmpty)
                Text(text(g['phone']), style: const TextStyle(color: C.soft, fontSize: 13)),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Pill(walkin ? 'Direct' : 'Hill Booker', walkin ? C.green : C.indigo),
            if (gone)
              const Padding(padding: EdgeInsets.only(top: 4), child: Pill('Checked out', C.soft))
            else if (here)
              const Padding(padding: EdgeInsets.only(top: 4), child: Pill('Here now', C.goldText)),
          ]),
        ]),
        const SizedBox(height: 6),
        Text(
          '${dayText(g['check_in'])} to ${dayText(g['check_out'])} · ${plural(nights, 'night')} · ${peopleText(toNum(g['people']).toInt(), 0)}',
          style: const TextStyle(color: C.soft, fontSize: 13),
        ),
        Text(
          text(g['room']).isEmpty
              ? 'No room given yet'
              : 'Room ${g['room']}${text(g['room_type']).isEmpty ? '' : ' · ${g['room_type']}'}',
          style: const TextStyle(color: C.soft, fontSize: 13),
        ),
        if (text(g['id_type']).isNotEmpty || text(g['vehicle_number']).isNotEmpty || photos > 0) ...[
          const SizedBox(height: 4),
          Wrap(spacing: 10, runSpacing: 2, children: [
            if (text(g['id_type']).isNotEmpty)
              Text(
                '${idTypeNames[text(g['id_type'])] ?? 'ID'}${text(g['id_number']).isEmpty ? '' : ': ${g['id_number']}'}',
                style: const TextStyle(color: C.soft, fontSize: 12.5),
              ),
            if (photos > 0)
              Text('$photos ID ${photos == 1 ? 'photo' : 'photos'}', style: const TextStyle(color: C.green, fontSize: 12.5, fontWeight: FontWeight.w600)),
            if (text(g['vehicle_number']).isNotEmpty)
              Text(
                '${text(g['vehicle_model']).isEmpty ? 'Vehicle' : g['vehicle_model']} · ${g['vehicle_number']}',
                style: const TextStyle(color: C.soft, fontSize: 12.5),
              ),
          ]),
        ],
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: HLine('Bill', money(toNum(g['bill'])))),
          const SizedBox(width: 12),
          Expanded(child: HLine('Paid', money(toNum(g['paid'])))),
        ]),
        HLine(
          balance > 0 ? 'Still to collect' : 'Settled',
          money(balance),
          strong: true,
          color: balance > 0 ? C.brick : C.green,
        ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => openBill(context, kind: walkin ? 'walkin' : 'hillbooker', id: text(g['id'])),
              child: const Text('Bill'),
            ),
          ),
          if (!gone) ...[
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton(onPressed: () => _checkOut(g), child: const Text('Check out')),
            ),
          ],
        ]),
      ]),
    );
  }
}
