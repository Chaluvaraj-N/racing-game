
Advanced Car Game — Deluxe

Files:
- index.html
- style.css
- script.js
- assets/ (car/bike PNGs, parallax backgrounds, explosion sprite, sound WAVs)

Firebase:
- Firestore is auto-initialized using the embedded config in index.html
- To change, edit the `window._firebaseConfig` object in index.html
- For testing, set Firestore rules to allow writes:
  service cloud.firestore {
    match /databases/{database}/documents {
      match /scores/{doc} {
        allow read, write: if true;
      }
    }
  }

MP3 / OGG conversion:
- I included WAV sound files. To convert to MP3 and OGG locally, run in the assets folder:
  ffmpeg -i snd_engine_loop.wav -codec:a libmp3lame -q:a 2 snd_engine_loop.mp3
  ffmpeg -i snd_engine_loop.wav -c:a libvorbis -q:a 5 snd_engine_loop.ogg
- Or convert all WAVs with:
  for f in *.wav; do ffmpeg -y -i "$f" -codec:a libmp3lame -q:a 2 "${f%.wav}.mp3"; done
  for f in *.wav; do ffmpeg -y -i "$f" -c:a libvorbis -q:a 5 "${f%.wav}.ogg"; done

Deploy:
- Upload the folder to GitHub and enable GitHub Pages, or host with Netlify.
- Ensure you do not publish sensitive credentials - Firebase web config is safe for client-side usage, but secure Firestore rules for production.
