import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:naijaspride_mobile/main.dart';

void main() {
  testWidgets('App renders', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: NaijaSprideApp()),
    );
    await tester.pumpAndSettle();
    expect(find.text('Home'), findsOneWidget);
  });
}
