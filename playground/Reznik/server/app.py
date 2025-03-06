from flask import Flask, jsonify, request, send_file
from pymongo import MongoClient
import os
import uuid
from datetime import datetime
import json

app = Flask(__name__)

# Подключение к MongoDB
client = MongoClient(os.environ.get('MONGODB_URL'))
db = client[os.environ.get('MONGO_DB_NAME', 'screen_recorder')]

# Коллекция для хранения записей
recordings_collection = db['recordings']

@app.route('/api/v1/start-recording', methods=['POST'])
def start_recording():
    """
    Начало записи экрана
    """
    try:
        # Получаем имя пользователя из запроса
        username = request.json.get('username', '').strip()

        if not username:
            return jsonify({
                'error': 'Пожалуйста, введите имя пользователя'
            }), 400

        # Генерируем уникальный ID записи
        recording_id = f"rec_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}"

        # Создаем запись в базе данных
        recording = {
            'id': recording_id,
            'username': username,
            'status': 'recording',
            'started_at': datetime.utcnow().isoformat(),
            'ended_at': None,
            'filename': None
        }

        # Сохраняем запись в MongoDB
        recordings_collection.insert_one(recording)

        return jsonify({
            'recording_id': recording_id,
            'message': 'Запись начата успешно'
        })

    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/api/v1/stop-recording', methods=['POST'])
def stop_recording():
    """
    Остановка записи экрана
    """
    try:
        # Получаем ID записи из запроса
        recording_id = request.json.get('recording_id')

        if not recording_id:
            return jsonify({
                'error': 'Необходимо указать ID записи'
            }), 400

        # Обновляем статус записи
        recording = recordings_collection.find_one_and_update(
            {'id': recording_id},
            {
                '$set': {
                    'status': 'completed',
                    'ended_at': datetime.utcnow().isoformat()
                }
            },
            return_document=True
        )

        if not recording:
            return jsonify({
                'error': 'Запись не найдена'
            }), 404

        return jsonify({
            'message': 'Запись завершена успешно',
            'recording': {
                'id': recording['id'],
                'username': recording['username'],
                'started_at': recording['started_at'],
                'ended_at': recording['ended_at']
            }
        })

    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/api/v1/recordings', methods=['GET'])
def get_recordings():
    """
    Получение списка записей
    """
    try:
        recordings = list(recordings_collection.find(
            {},
            {
                '_id': 0,
                'id': 1,
                'username': 1,
                'status': 1,
                'started_at': 1,
                'ended_at': 1
            }
        ))
        return jsonify(recordings)
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/api/v1/recordings/<recording_id>', methods=['GET'])
def get_recording(recording_id):
    """
    Получение информации о конкретной записи
    """
    try:
        recording = recordings_collection.find_one(
            {'id': recording_id},
            {
                '_id': 0
            }
        )

        if not recording:
            return jsonify({
                'error': 'Запись не найдена'
            }), 404

        return jsonify(recording)
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('FLASK_PORT', '5000')))