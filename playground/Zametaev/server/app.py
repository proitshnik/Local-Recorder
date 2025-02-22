from flask import Flask
from flask_pymongo import PyMongo

app = Flask(__name__)

MONGO_HOST = "mongo"
MONGO_PORT = 27017
MONGO_DB = "myDatabase"

app.config["MONGO_URI"] = f"mongodb://{MONGO_HOST}:{MONGO_PORT}/"
mongo = PyMongo(app)

db = mongo.db


@app.route("/")
def home():
    try:
        db.users.insert_one({"name": "Алексей", "age": 30})

        user = db.users.find_one({"name": "Алексей"})

        if user:
            return f"Привет, {user['name']}! Тебе {user['age']} лет."
        else:
            return "Пользователь не найден.", 404

    except Exception as e:
        return f"Произошла ошибка: {str(e)}", 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)