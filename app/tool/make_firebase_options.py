"""Writes lib/firebase_options.dart from google-services.json (the file downloaded from the Firebase console).
Run from the app folder:  python3 tool/make_firebase_options.py"""
import json
import sys

with open("google-services.json", encoding="utf-8") as f:
    g = json.load(f)
info = g["project_info"]
client = g["client"][0]
vals = {
    "apiKey": client["api_key"][0]["current_key"],
    "appId": client["client_info"]["mobilesdk_app_id"],
    "messagingSenderId": info["project_number"],
    "projectId": info["project_id"],
}
if not all(vals.values()):
    sys.exit("google-services.json is missing a value")
body = ", ".join(f"{k}: '{v}'" for k, v in vals.items())
with open("lib/firebase_options.dart", "w", encoding="utf-8") as f:
    f.write(
        "import 'package:firebase_core/firebase_core.dart';\n\n"
        "// Written by tool/make_firebase_options.py during the build.\n"
        "class DefaultFirebaseOptions {\n"
        "  static const bool isConfigured = true;\n"
        f"  static const FirebaseOptions android = FirebaseOptions({body});\n"
        "}\n"
    )
print("firebase_options.dart written for project", info["project_id"])
