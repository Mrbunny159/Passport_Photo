"""
Passport Photo Maker — backend launcher
"""

import os
import sys

def check_dependencies():
    """Fail early with a friendly message if packages are missing."""
    missing = []
    for mod in ("fastapi", "uvicorn", "rembg"):
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)

    if missing:
        print("=" * 55)
        print(" ❌ Missing packages:", ", ".join(missing))
        print()
        print(" You need to activate your virtual environment first,")
        print(" and then install the requirements.")
        print("=" * 55)
        input("\nPress Enter to close this window...")
        sys.exit(1)

def main():
    import uvicorn

    # make sure 'main.py' is importable no matter where we're launched from
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, base_dir)
    os.chdir(base_dir)

    host = "127.0.0.1"
    port = 8000

    print("=" * 55)
    print(" 📸 Passport Photo Maker — backend is starting...")
    print(f"    Server:  http://{host}:{port}")
    print(f"    Docs:    http://{host}:{port}/docs")
    print(f"    Health:  http://{host}:{port}/health")
    print("    (The first time you use 'Remove BG', it will download")
    print("     an AI model. This takes about 1 minute, then it's cached.)")
    print("    Press Ctrl+C in this window to stop the server.")
    print("=" * 55)

    try:
        uvicorn.run("main:app", host=host, port=port, reload=True)
    except KeyboardInterrupt:
        print("\nServer stopped. Bye!")
    except Exception as e:
        print(f"\n❌ An error occurred: {e}")
        input("\nPress Enter to close this window...")

if __name__ == "__main__":
    try:
        check_dependencies()
        main()
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        input("\nPress Enter to close this window...")