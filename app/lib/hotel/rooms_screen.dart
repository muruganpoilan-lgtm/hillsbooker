import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'bill_screen.dart';
import 'guest_form.dart';
import 'hotel_common.dart';

// The room board: every room with its status and who is in it, the Hill Booker
// guests arriving today who still need a room, and how each room type is selling.

class RoomsSection extends StatefulWidget {
  final String propertyId;
  const RoomsSection({super.key, required this.propertyId});

  @override
  State<RoomsSection> createState() => _RoomsSectionState();
}

class _RoomsSectionState extends State<RoomsSection> {
  List<Map<String, dynamic>> _rooms = [];
  List<Map<String, dynamic>> _types = [];
  List<Map<String, dynamic>> _arrivals = [];
  bool _loading = true;
  String _error = '';

  /// Rooms whose status is being saved, and a counter so a slow reply can't
  /// overwrite a newer tap.
  final Set<String> _busy = <String>{};
  final Map<String, int> _seq = <String, int>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Api.get('/hotel/${widget.propertyId}/rooms');
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
      _rooms = rowList(d['rooms']);
      _types = rowList(d['room_types']);
      _arrivals = rowList(d['arrivals']);
    });
  }

  int _count(String status) => _rooms.where((r) => text(r['status']) == status).length;

  List<Map<String, dynamic>> get _freeRooms =>
      _rooms.where((r) => text(r['status']) == 'free' && text(r['guest_id']).isEmpty).toList();

  // ---------- actions ----------

  Future<void> _setStatus(Map<String, dynamic> room, String status) async {
    final id = text(room['id']);
    final mine = (_seq[id] ?? 0) + 1;
    setState(() {
      _seq[id] = mine;
      _busy.add(id);
      room['status'] = status; // show it straight away; the reload confirms it
    });
    final res = await Api.patch('/hotel/rooms/$id', body: {'status': status});
    if (!mounted || _seq[id] != mine) return;
    setState(() => _busy.remove(id));
    if (!res.ok) {
      snack(context, res.error);
      await _load();
      return;
    }
    await _load();
  }

  Future<void> _checkOut(Map<String, dynamic> room) async {
    final kind = text(room['guest_kind']);
    final gid = text(room['guest_id']);
    final balance = toNum(room['guest_balance']);
    final warning = balance > 0
        ? 'There is still ${money(balance)} to collect from ${room['guest_name']}. Check out anyway?'
        : '${room['guest_name']} will be checked out and the room goes to Cleaning.';
    final yes = await askYesNo(context, 'Check out?', warning, 'Check out');
    if (!yes || !mounted) return;

    final path = kind == 'walkin' ? '/hotel/guests/$gid/checkout' : '/hotel/bookings/$gid/checkout';
    final res = await Api.post(path);
    if (!mounted) return;
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    await _load();
  }

  Future<void> _giveRoom(Map<String, dynamic> arrival) async {
    final free = _freeRooms;
    if (free.isEmpty) {
      snack(context, 'No room is free right now. Mark a room free once it is cleaned.');
      return;
    }
    final chosen = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
      builder: (ctx) => SafeArea(
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.symmetric(vertical: 8), children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
            child: Text('Give ${arrival['name']} a room', style: display(18)),
          ),
          for (final r in free)
            ListTile(
              leading: const Icon(Icons.meeting_room_outlined, color: C.green),
              title: Text(text(r['label']), style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(text(r['room_type']).isEmpty ? 'No room type set' : text(r['room_type'])),
              onTap: () => Navigator.of(ctx).pop(text(r['id'])),
            ),
        ]),
      ),
    );
    if (chosen == null || !mounted) return;
    final res = await Api.post('/hotel/bookings/${arrival['id']}/room', body: {'room_id': chosen});
    if (!mounted) return;
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    await _load();
  }

  Future<void> _roomSheet({Map<String, dynamic>? room}) async {
    final label = TextEditingController(text: text(room?['label']));
    final note = TextEditingController(text: text(room?['note']));
    String? typeId = text(room?['room_type_id']).isEmpty ? null : text(room?['room_type_id']);
    String error = '';
    final types = <String, String>{};
    for (final t in _types) {
      types[text(t['id'])] = text(t['name']);
    }

    final saved = await hotelSheet<bool>(
      context,
      room == null ? 'Add a room' : 'Room ${room['label']}',
      (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(
              controller: label,
              textCapitalization: TextCapitalization.characters,
              decoration: fieldDeco('Room number or name', hint: 'such as 101 or Cottage A'),
            ),
            const SizedBox(height: 12),
            HChoice(
              label: 'Room type',
              value: types.containsKey(typeId) ? typeId : null,
              options: types,
              emptyLabel: 'Not set',
              onChanged: (v) => setSheet(() => typeId = v),
            ),
            const SizedBox(height: 12),
            TextField(controller: note, decoration: fieldDeco('Note', hint: 'Optional')),
            if (error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error, style: const TextStyle(color: C.brick)),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                if (label.text.trim().isEmpty) {
                  setSheet(() => error = 'Give the room a number or a name.');
                  return;
                }
                final body = {
                  'label': label.text.trim(),
                  'room_type_id': typeId,
                  'note': note.text.trim().isEmpty ? null : note.text.trim(),
                };
                final res = room == null
                    ? await Api.post('/hotel/${widget.propertyId}/rooms', body: body)
                    : await Api.patch('/hotel/rooms/${room['id']}', body: body);
                if (!ctx2.mounted) return;
                if (!res.ok) {
                  setSheet(() => error = res.error);
                  return;
                }
                Navigator.of(ctx2).pop(true);
              },
              child: Text(room == null ? 'Add this room' : 'Save'),
            ),
            if (room != null) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () async {
                  final yes = await askYesNo(ctx2, 'Remove room ${room['label']}?',
                      'The room is deleted from the board. Guest records are kept.', 'Remove');
                  if (!yes || !ctx2.mounted) return;
                  final res = await Api.delete('/hotel/rooms/${room['id']}');
                  if (!ctx2.mounted) return;
                  if (!res.ok) {
                    setSheet(() => error = res.error);
                    return;
                  }
                  Navigator.of(ctx2).pop(true);
                },
                icon: const Icon(Icons.delete_outline, size: 18, color: C.brick),
                label: const Text('Remove this room', style: TextStyle(color: C.brick)),
                style: OutlinedButton.styleFrom(side: const BorderSide(color: C.brick)),
              ),
            ],
          ]);
        },
      ),
    );

    label.dispose();
    note.dispose();
    if (saved == true && mounted) await _load();
  }

  Future<void> _autoCreate() async {
    final yes = await askYesNo(
      context,
      'Create rooms from your room types?',
      'One room is made for every room you said you have, numbered 101, 102 and so on. You can rename them after.',
      'Create',
    );
    if (!yes || !mounted) return;
    final res = await Api.post('/hotel/${widget.propertyId}/rooms/auto');
    if (!mounted) return;
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    final made = toNum(rowMap(res.data)['created']).toInt();
    snack(context, made == 0 ? 'Every room is already on the board.' : 'Added ${plural(made, 'room')}.');
    await _load();
  }

  // ---------- build ----------

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: C.green));
    if (_error.isNotEmpty) {
      return ErrorBox(title: "We couldn't load your rooms", message: _error, onRetry: _load);
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 36),
        children: [
          HTotals(children: [
            Row(children: [
              _tally('Free', _count('free'), C.green),
              _tally('Occupied', _count('occupied'), C.brick),
              _tally('Cleaning', _count('cleaning'), C.goldText),
              _tally('Repair', _count('repair'), C.soft),
            ]),
          ]),
          if (_arrivals.isNotEmpty) ...[
            const HHeading('Arriving today, no room yet'),
            for (final a in _arrivals) _arrivalCard(a),
          ],
          HHeading(
            'Rooms',
            action: FilledButton.icon(
              onPressed: () => _roomSheet(),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add'),
            ),
          ),
          if (_rooms.isEmpty) ...[
            const HEmpty('No rooms on the board yet. Add them one by one, or make them from your room types in one go.'),
            OutlinedButton.icon(
              onPressed: _autoCreate,
              icon: const Icon(Icons.auto_awesome_outlined, size: 18),
              label: const Text('Create rooms from my room types'),
            ),
          ],
          for (final r in _rooms) _roomCard(r),
          if (_types.isNotEmpty) ...[
            const SizedBox(height: 12),
            const HHeading('How each room type is selling today'),
            for (final t in _types) _typeCard(t),
          ],
        ],
      ),
    );
  }

  Widget _tally(String label, int n, Color color) {
    return Expanded(
      child: Column(children: [
        Text('$n', style: display(22, color: color)),
        Text(label, style: const TextStyle(color: C.soft, fontSize: 12.5, fontWeight: FontWeight.w600)),
      ]),
    );
  }

  Widget _arrivalCard(Map<String, dynamic> a) {
    return HCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(text(a['name']), style: display(17))),
          const Pill('Hill Booker', C.indigo),
        ]),
        const SizedBox(height: 2),
        Text(
          '${text(a['room_type'])} · ${plural(toNum(a['rooms']).toInt(), 'room')} · ${peopleText(toNum(a['people']).toInt(), 0)}',
          style: const TextStyle(color: C.soft),
        ),
        Text('Leaving ${dayText(a['check_out'])}', style: const TextStyle(color: C.soft, fontSize: 13)),
        if (toNum(a['balance']) > 0)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('${money(toNum(a['balance']))} to collect', style: const TextStyle(color: C.brick, fontWeight: FontWeight.w700)),
          ),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: FilledButton(onPressed: () => _giveRoom(a), child: const Text('Give a room')),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton(
              onPressed: () async {
                final saved = await openGuestForm(
                  context,
                  propertyId: widget.propertyId,
                  guest: {...a, 'source': 'hillbooker', 'collected': 0},
                );
                if (saved && mounted) await _load();
              },
              child: const Text('Details'),
            ),
          ),
        ]),
      ]),
    );
  }

  Widget _roomCard(Map<String, dynamic> r) {
    final status = text(r['status']);
    final guestId = text(r['guest_id']);
    final hasGuest = guestId.isNotEmpty;
    final id = text(r['id']);
    final busy = _busy.contains(id);

    return HCard(
      fill: roomStatusFill(status),
      border: roomStatusColor(status).withValues(alpha: 0.35),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(text(r['label']), style: display(20)),
              if (text(r['room_type']).isNotEmpty)
                Text(text(r['room_type']), style: const TextStyle(color: C.soft, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(_roomFacts(r), style: const TextStyle(color: C.soft, fontSize: 12.5)),
            ]),
          ),
          IconButton(
            tooltip: 'Edit this room',
            icon: const Icon(Icons.edit_outlined, size: 19, color: C.soft),
            onPressed: () => _roomSheet(room: r),
          ),
        ]),

        if (text(r['note']).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(text(r['note']), style: const TextStyle(color: C.soft, fontSize: 12.5, fontStyle: FontStyle.italic)),
          ),

        if (hasGuest) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6), border: Border.all(color: C.line)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(text(r['guest_name']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                Pill(text(r['guest_kind']) == 'walkin' ? 'Direct' : 'Hill Booker',
                    text(r['guest_kind']) == 'walkin' ? C.green : C.indigo),
              ]),
              if (text(r['guest_phone']).isNotEmpty)
                Text(text(r['guest_phone']), style: const TextStyle(color: C.soft, fontSize: 13)),
              Text('Until ${dayText(r['guest_until'])}', style: const TextStyle(color: C.soft, fontSize: 13)),
              if (toNum(r['guest_balance']) > 0)
                Text('${money(toNum(r['guest_balance']))} to collect',
                    style: const TextStyle(color: C.brick, fontWeight: FontWeight.w700, fontSize: 13)),
            ]),
          ),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: FilledButton(onPressed: busy ? null : () => _checkOut(r), child: const Text('Check out')),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: () => openBill(
                  context,
                  kind: text(r['guest_kind']) == 'walkin' ? 'walkin' : 'hillbooker',
                  id: guestId,
                ),
                child: const Text('Bill'),
              ),
            ),
          ]),
        ] else ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: FilledButton(
                onPressed: status == 'free'
                    ? () async {
                        final saved = await openGuestForm(context, propertyId: widget.propertyId, roomId: id);
                        if (saved && mounted) await _load();
                      }
                    : null,
                child: const Text('Check in guest'),
              ),
            ),
          ]),
          if (status != 'free')
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                status == 'cleaning'
                    ? 'Mark it Free once it is cleaned, then you can check a guest in.'
                    : 'Mark it Free when it is ready for guests again.',
                style: const TextStyle(color: C.soft, fontSize: 12.5),
              ),
            ),
        ],

        const SizedBox(height: 12),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: roomStatusNames.entries.map((e) {
            final on = status == e.key;
            final blocked = hasGuest && e.key != 'occupied';
            return ChoiceChip(
              selected: on,
              onSelected: (busy || blocked) ? null : (_) => _setStatus(r, e.key),
              label: Text(e.value),
              labelStyle: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 12.5,
                color: on ? Colors.white : (blocked ? C.soft : C.ink),
              ),
              selectedColor: roomStatusColor(e.key),
              backgroundColor: Colors.white,
              showCheckmark: false,
              visualDensity: VisualDensity.compact,
              side: BorderSide(color: on ? roomStatusColor(e.key) : C.line),
            );
          }).toList(),
        ),
        if (hasGuest)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('Check the guest out before changing the status.', style: TextStyle(color: C.soft, fontSize: 12)),
          ),
      ]),
    );
  }

  String _roomFacts(Map<String, dynamic> r) {
    final bits = <String>[];
    final price = toNum(r['base_price']);
    if (price > 0) bits.add('${money(price)} a night');
    final beds = toNum(r['bed_count']).toInt();
    final bedType = text(r['bed_type']);
    if (beds > 0 || bedType.isNotEmpty) {
      bits.add(beds > 0 ? '${plural(beds, 'bed')}${bedType.isEmpty ? '' : ' ($bedType)'}' : bedType);
    }
    final max = toNum(r['max_guests']).toInt();
    if (max > 0) bits.add('up to ${plural(max, 'guest')}');
    return bits.isEmpty ? 'No room type set, so no price or beds to show' : bits.join(' · ');
  }

  Widget _typeCard(Map<String, dynamic> t) {
    final booked = toNum(t['booked_today']).toInt();
    final total = toNum(t['total_rooms']).toInt();
    final listed = toNum(t['listed']).toInt();
    return HCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(text(t['name']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            Text('$listed of $total on the board', style: const TextStyle(color: C.soft, fontSize: 12.5)),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('$booked booked', style: const TextStyle(fontWeight: FontWeight.w800)),
          Text('${(total - booked).clamp(0, total)} free', style: const TextStyle(color: C.soft, fontSize: 12.5)),
        ]),
      ]),
    );
  }
}
