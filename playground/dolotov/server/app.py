from flask import Flask, request, jsonify
from pymongo import MongoClient
import os

app = Flask(__name__)
client = MongoClient('mongodb://mongo:27017/')
db = client.screen_recorder

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    file_path = os.path.join('/data', file.filename)
    file.save(file_path)
    db.recordings.insert_one({'filename': file.filename, 'path': file_path})
    return jsonify({'success': True}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
