from flask import Flask, request, jsonify
from pymongo import MongoClient
import gridfs
from bson import ObjectId
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

client = MongoClient('mongodb://mongo-db:27017/')
db = client["video_database"]
fs = gridfs.GridFS(db)  # Используем GridFS для работы с файлами

@app.route('/upload', methods=['POST'])
def upload_file():
    file = request.files['file']
    username = request.form['username']
    start = request.form['start']
    end = request.form['end']
    file_id = fs.put(file.read(), filename=file.filename, metadata={
        'username': username, 'start': start, 'end': end})
    return jsonify({"file_id": str(file_id)}), 200

@app.route('/get/<file_id>', methods=['GET'])
def get_file(file_id):
    try:
        file_data = fs.get(ObjectId(file_id))
        return file_data.read(), 200, {
            'Content-Type': 'video/webm',
            'Content-Disposition': f'attachment; filename={file_data.filename}'
        }
    except gridfs.errors.NoFile:
        return jsonify({"error": "File not found"}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
