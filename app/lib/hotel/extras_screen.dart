import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'bill_screen.dart';
import 'hotel_common.dart';

// Orders and extras: food, laundry and travel desk charges posted to a guest's
// room bill, plus the price list they are picked from.

class ExtrasSection extends StatefulWidget {
  final String propertyId;
  const ExtrasSection({super.key, required this.propertyId});

  @override
  State<ExtrasSection> createState() => _ExtrasSectionState();
}

class _ExtrasSectionState extends State<ExtrasSection> {
  bool _priceList = false;

  DateTime _day = today();
  List<Map<String, dynamic>> _staying = [];
  List<Map<String, dynamic>> _menu = [];
  List<Map<String, dynamic>> _charges = [];
  num _dayTotal = 0;
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Api.get('/hotel/${widget.propertyId}/extras', query: {'day': isoDate(_day)});
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
      _staying = rowList(d['staying']);
      _menu = rowList(d['menu']);
      _charges = rowList(d['charges']);
      _dayTotal = toNum(d['day_total']);
    });
  }

  Future<void> _changeDay(int by) async {
    setState(() {
      _day = _day.add(Duration(days: by));
      _loading = true;
    });
    await _load();
  }

  // ---------- posting a charge ----------

  Future<void> _addFor(Map<String, dynamic> guest) async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
      builder: (ctx) => _OrderSheet(
        propertyId: widget.propertyId,
        guest: guest,
        menu: _menu,
        day: _day,
      ),
    );
    if (added == true && mounted) await _load();
  }

  Future<void> _removeCharge(Map<String, dynamic> c) async {
    final yes = await askYesNo(
      context,
      'Remove this charge?',
      '${c['name']} (${money(toNum(c['amount']))}) comes off ${c['guest']}\'s bill.',
      'Remove',
    );
    if (!yes || !mounted) return;
    final res = await Api.delete('/hotel/charges/${c['id']}');
    if (!mounted) return;
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    await _load();
  }

  // ---------- the price list ----------

  Future<void> _menuSheet({Map<String, dynamic>? item}) async {
    final name = TextEditingController(text: text(item?['name']));
    final price = TextEditingController(text: item == null ? '' : toNum(item['price']).round().toString());
    String category = text(item?['category']).isEmpty ? 'food' : text(item!['category']);
    String error = '';

    final saved = await hotelSheet<bool>(
      context,
      item == null ? 'Add to the price list' : text(item['name']),
      (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(
              controller: name,
              textCapitalization: TextCapitalization.sentences,
              decoration: fieldDeco('Name', hint: 'Masala dosa, shirt wash…'),
            ),
            const SizedBox(height: 12),
            HChoice(
              label: 'Goes under',
              value: category,
              options: extraKindNames,
              onChanged: (v) => setSheet(() => category = v ?? 'food'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: price,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: fieldDeco('Price ₹'),
            ),
            if (error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error, style: const TextStyle(color: C.brick)),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                if (name.text.trim().isEmpty) {
                  setSheet(() => error = 'Give it a name.');
                  return;
                }
                final v = parseMoney(price.text);
                if (v == null || v < 0) {
                  setSheet(() => error = 'Enter a price.');
                  return;
                }
                final body = {'name': name.text.trim(), 'category': category, 'price': moneyOut(v)};
                final res = item == null
                    ? await Api.post('/hotel/${widget.propertyId}/menu', body: body)
                    : await Api.patch('/hotel/menu/${item['id']}', body: body);
                if (!ctx2.mounted) return;
                if (!res.ok) {
                  setSheet(() => error = res.error);
                  return;
                }
                Navigator.of(ctx2).pop(true);
              },
              child: Text(item == null ? 'Add' : 'Save'),
            ),
            if (item != null) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () async {
                  final yes = await askYesNo(ctx2, 'Remove ${item['name']}?',
                      'It comes off the price list. Charges already posted to a bill stay as they are.', 'Remove');
                  if (!yes || !ctx2.mounted) return;
                  final res = await Api.delete('/hotel/menu/${item['id']}');
                  if (!ctx2.mounted) return;
                  if (!res.ok) {
                    setSheet(() => error = res.error);
                    return;
                  }
                  Navigator.of(ctx2).pop(true);
                },
                icon: const Icon(Icons.delete_outline, size: 18, color: C.brick),
                label: const Text('Remove', style: TextStyle(color: C.brick)),
                style: OutlinedButton.styleFrom(side: const BorderSide(color: C.brick)),
              ),
            ],
          ]);
        },
      ),
    );

    name.dispose();
    price.dispose();
    if (saved == true && mounted) await _load();
  }

  // ---------- build ----------

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: C.green));
    if (_error.isNotEmpty) {
      return ErrorBox(title: "We couldn't load the orders", message: _error, onRetry: _load);
    }

    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
        child: SizedBox(
          width: double.infinity,
          child: SegmentedButton<bool>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment<bool>(value: false, label: Text('Orders')),
              ButtonSegment<bool>(value: true, label: Text('Price list')),
            ],
            selected: {_priceList},
            onSelectionChanged: (s) => setState(() => _priceList = s.first),
          ),
        ),
      ),
      Expanded(
        child: RefreshIndicator(onRefresh: _load, child: _priceList ? _priceListView() : _ordersView()),
      ),
    ]);
  }

  Widget _ordersView() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
      children: [
        Row(children: [
          IconButton(icon: const Icon(Icons.chevron_left), tooltip: 'Previous day', onPressed: () => _changeDay(-1)),
          Expanded(
            child: Center(
              child: Column(children: [
                Text(prettyDayYear(_day), style: display(17)),
                Text(money(_dayTotal), style: const TextStyle(color: C.green, fontWeight: FontWeight.w800)),
              ]),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Next day',
            onPressed: _day.isBefore(today()) ? () => _changeDay(1) : null,
          ),
        ]),
        const HHeading('Guests staying now'),
        if (_staying.isEmpty)
          const HEmpty('Nobody is staying right now, so there is no bill to post an order to.')
        else
          for (final g in _staying) _stayingCard(g),
        const SizedBox(height: 10),
        HHeading('Posted on ${prettyDay(_day)}'),
        if (_charges.isEmpty)
          const HEmpty('No food, laundry or travel charges posted on this day.')
        else
          for (final c in _charges) _chargeCard(c),
      ],
    );
  }

  Widget _stayingCard(Map<String, dynamic> g) {
    final balance = toNum(g['balance']);
    return HCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(text(g['name']), style: display(16)),
              Text(
                text(g['room']).isEmpty ? 'No room given' : 'Room ${g['room']}',
                style: const TextStyle(color: C.soft, fontSize: 12.5),
              ),
              Text('Until ${dayText(g['check_out'])}', style: const TextStyle(color: C.soft, fontSize: 12.5)),
            ]),
          ),
          Pill(text(g['kind']) == 'walkin' ? 'Direct' : 'Hill Booker', text(g['kind']) == 'walkin' ? C.green : C.indigo),
        ]),
        const SizedBox(height: 6),
        if (toNum(g['extras']) > 0) HLine('Extras so far', money(toNum(g['extras']))),
        HLine(
          balance > 0 ? 'Bill so far' : 'Settled',
          money(balance),
          strong: true,
          color: balance > 0 ? C.brick : C.green,
        ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: () => _addFor(g),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add order'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton(
              onPressed: () => openBill(context, kind: text(g['kind']), id: text(g['id'])),
              child: const Text('Bill'),
            ),
          ),
        ]),
      ]),
    );
  }

  Widget _chargeCard(Map<String, dynamic> c) {
    final qty = toNum(c['qty']).toInt();
    return HCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              qty > 1 ? '${c['name']} × $qty' : text(c['name']),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            Text(
              '${extraKindNames[text(c['category'])] ?? 'Other'} · ${c['guest']}${text(c['room']).isEmpty ? '' : ' · room ${c['room']}'}',
              style: const TextStyle(color: C.soft, fontSize: 12.5),
            ),
            if (text(c['note']).isNotEmpty)
              Text(text(c['note']), style: const TextStyle(color: C.soft, fontSize: 12, fontStyle: FontStyle.italic)),
          ]),
        ),
        Text(money(toNum(c['amount'])), style: const TextStyle(fontWeight: FontWeight.w800)),
        IconButton(
          tooltip: 'Remove',
          icon: const Icon(Icons.delete_outline, size: 18, color: C.soft),
          onPressed: () => _removeCharge(c),
        ),
      ]),
    );
  }

  Widget _priceListView() {
    final byCategory = <String, List<Map<String, dynamic>>>{};
    for (final m in _menu) {
      byCategory.putIfAbsent(text(m['category']), () => []).add(m);
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
      children: [
        FilledButton.icon(
          onPressed: () => _menuSheet(),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Add to the price list'),
        ),
        const SizedBox(height: 8),
        const Text(
          'Anything on this list can be added to a guest in two taps. You can still charge something that is not on the list.',
          style: TextStyle(color: C.soft, fontSize: 13),
        ),
        const SizedBox(height: 14),
        if (_menu.isEmpty) const HEmpty('Nothing on the price list yet. Add your common dishes and laundry rates.'),
        for (final kind in extraKindNames.keys)
          if ((byCategory[kind] ?? []).isNotEmpty) ...[
            HHeading(extraKindNames[kind]!),
            for (final m in byCategory[kind]!)
              HCard(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                onTap: () => _menuSheet(item: m),
                child: Row(children: [
                  Expanded(child: Text(text(m['name']), style: const TextStyle(fontWeight: FontWeight.w700))),
                  Text(money(toNum(m['price'])), style: const TextStyle(fontWeight: FontWeight.w800)),
                  const Icon(Icons.chevron_right, color: C.soft),
                ]),
              ),
          ],
      ],
    );
  }
}

// The sheet that posts a charge: tap something from the price list, or type
// anything else in.
class _OrderSheet extends StatefulWidget {
  final String propertyId;
  final Map<String, dynamic> guest;
  final List<Map<String, dynamic>> menu;
  final DateTime day;

  const _OrderSheet({
    required this.propertyId,
    required this.guest,
    required this.menu,
    required this.day,
  });

  @override
  State<_OrderSheet> createState() => _OrderSheetState();
}

class _OrderSheetState extends State<_OrderSheet> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _price = TextEditingController();
  final TextEditingController _note = TextEditingController();
  String _category = 'food';
  int _qty = 1;
  bool _busy = false;
  bool _anyAdded = false;
  String _error = '';

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _post(String name, String category, num unitPrice, int qty) async {
    setState(() {
      _busy = true;
      _error = '';
    });
    final res = await Api.post('/hotel/${widget.propertyId}/charges', body: {
      'kind': text(widget.guest['kind']),
      'target_id': text(widget.guest['id']),
      'name': name,
      'category': category,
      'qty': qty,
      'unit_price': unitPrice,
      'charged_on': isoDate(widget.day),
      'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    _anyAdded = true;
    if (!mounted) return;
    snack(context, 'Added to ${widget.guest['name']}\'s bill.');
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
          child: AbsorbPointer(
            absorbing: _busy,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Add to ${widget.guest['name']}', style: display(18)),
                    Text(
                      text(widget.guest['room']).isEmpty ? 'No room given' : 'Room ${widget.guest['room']}',
                      style: const TextStyle(color: C.soft, fontSize: 12.5),
                    ),
                  ]),
                ),
                IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop(_anyAdded)),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                const Text('How many', style: TextStyle(color: C.soft, fontWeight: FontWeight.w600)),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline),
                  onPressed: _qty > 1 ? () => setState(() => _qty--) : null,
                ),
                Text('$_qty', style: display(18)),
                IconButton(
                  icon: const Icon(Icons.add_circle_outline),
                  onPressed: _qty < 99 ? () => setState(() => _qty++) : null,
                ),
              ]),
              if (widget.menu.isNotEmpty) ...[
                const Divider(color: C.line),
                const Text('From the price list', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                for (final m in widget.menu)
                  HCard(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                    onTap: () => _post(text(m['name']), text(m['category']), toNum(m['price']), _qty),
                    child: Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(text(m['name']), style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(extraKindNames[text(m['category'])] ?? 'Other',
                              style: const TextStyle(color: C.soft, fontSize: 12)),
                        ]),
                      ),
                      Text(money(toNum(m['price']) * _qty), style: const TextStyle(fontWeight: FontWeight.w800)),
                      const Icon(Icons.add, color: C.green, size: 20),
                    ]),
                  ),
              ],
              const Divider(color: C.line),
              const Text('Something else', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              TextField(
                controller: _name,
                textCapitalization: TextCapitalization.sentences,
                decoration: fieldDeco('What was it'),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: HChoice(
                    label: 'Goes under',
                    value: _category,
                    options: extraKindNames,
                    onChanged: (v) => setState(() => _category = v ?? 'food'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _price,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    decoration: fieldDeco('Price each ₹'),
                  ),
                ),
              ]),
              const SizedBox(height: 12),
              TextField(controller: _note, decoration: fieldDeco('Note', hint: 'Optional')),
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(_error, style: const TextStyle(color: C.brick)),
                ),
              const SizedBox(height: 14),
              FilledButton(
                onPressed: _busy
                    ? null
                    : () {
                        if (_name.text.trim().isEmpty) {
                          setState(() => _error = 'What should it be called on the bill?');
                          return;
                        }
                        final v = parseMoney(_price.text);
                        if (v == null || v < 0) {
                          setState(() => _error = 'Enter the price for one.');
                          return;
                        }
                        _post(_name.text.trim(), _category, moneyOut(v), _qty);
                      },
                child: Text(_busy ? 'Adding…' : 'Add to the bill'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
