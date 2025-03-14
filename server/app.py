import json
import os
from flask import Flask, request, jsonify, Response
from pymongo import MongoClient
import gridfs
from bson import ObjectId
from flask_cors import CORS
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

client = MongoClient('mongodb://mongo-db:27017/')
db = client["video_database"]
fs = gridfs.GridFS(db)  # Используем GridFS для работы с файлами
sessions_collection = db["sessions"]

UPLOAD_FOLDER = "data"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.route("/start_session", methods=["POST"])
def start_session():
    """Создает новую запись сессии в базе данных"""
    try:
        data = request.form
        group = data.get("group")
        surname = data.get("surname")
        name = data.get("name")
        patronymic = data.get("patronymic")

        if not (group and surname and name and patronymic):
            return jsonify({"error": "Поля 'group', 'surname', 'name', 'patronymic' обязательны для заполнения"}), 400

        session_start = datetime.now(timezone.utc)
        # Форматирование даты
        session_date_start, session_time_start = session_start.strftime("%Y-%m-%d %H:%M:%S").split()
        id = ObjectId()

        session_data = {
            "_id": id,
            "group": group,
            "surname": surname,
            "name": name,
            "patronymic": patronymic,
            "session_date_start": session_date_start,
            "session_time_start": session_time_start,
            "session_date_end": None,
            "session_time_end": None,
            "video_path": None,
            "status": None
        }

        sessions_collection.insert_one(session_data)
        return jsonify({"id": str(id)}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/upload_video", methods=["POST"])
def upload_video():
    """Обрабатывает загрузку видео с клиента, сохраняет файл и обновляет данные сеанса."""
    try:
        if "video" not in request.files or "id" not in request.form:
            return jsonify({"error": "Отсутствует видеофайл или ID сессии"}), 400

        video = request.files["video"]
        id = request.form["id"]

        session = sessions_collection.find_one({"_id": ObjectId(id)})
        if not session:
            return jsonify({"error": "Сессия не найдена"}), 404

        session_end = datetime.now(timezone.utc)
        # Форматирование даты
        session_date_end, session_time_end = session_end.strftime("%Y-%m-%d %H:%M:%S").split()
        extension = os.path.splitext(video.filename)[1] or ".mp4"
        video_name = f"{id}_{session['session_date_start'].replace('-', '')}T{session['session_time_start'].replace(':', '')}_{session['surname']}{extension}"
        video_path = os.path.join(UPLOAD_FOLDER, video_name)
        video.save(video_path)

        sessions_collection.update_one(
            {"_id": ObjectId(id)},
            {"$set": {
                "session_date_end": session_date_end,
                "session_time_end": session_time_end,
                "video_path": video_path,
                "status": "good"
            }}
        )

        return jsonify({"message": "Видео успешно загружено", "video_path": video_path}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/get_sessions', methods=['GET'])
def get_sessions():
    try:
        sessions = list(sessions_collection.find({}))

        if not sessions:
            return Response(json.dumps({"message": "Нет записей в базе данных."}, ensure_ascii=False, indent=2), mimetype="application/json")

        result = [
            {
                **{"id": str(session["_id"])},  # Преобразуем _id в id
                **{key: session.get(key) for key in session if key != "_id"}  # Копируем остальные поля
            }
            for session in sessions
        ]

        return Response(json.dumps(result, ensure_ascii=False, indent=2), mimetype="application/json")
    except Exception as e:
        return Response(json.dumps({"error": str(e)}, ensure_ascii=False, indent=2), mimetype="application/json")


# @app.route('/get/<file_id>', methods=['GET'])
# def get_file(file_id):
#     try:
#         file_data = fs.get(ObjectId(file_id))
#         return file_data.read(), 200, {
#             'Content-Type': 'video/webm',
#             'Content-Disposition': f'attachment; filename={file_data.filename}'
#         }
#     except gridfs.errors.NoFile:
#         return jsonify({"error": "File not found"}), 404


# @app.route('/check_sessions', methods=['POST'])
# def check_sessions():
#     try:
#         now = datetime.now(timezone.utc)
#         pending_sessions = db.sessions.find({"status": "pending"})

#         for session in pending_sessions:
#             if "session_end" in session and session["session_end"]:
#                 db.sessions.update_one(
#                     {"_id": session["_id"]},
#                     {"$set": {"status": "completed"}}
#                 )
#             else:
#                 db.sessions.update_one(
#                     {"_id": session["_id"]},
#                     {"$set": {"status": "suspicious"}}
#                 )

#         return jsonify({'message': 'Sessions checked and updated'}), 200
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
