import os
from flask import Flask, jsonify
from flask_pymongo import PyMongo

app = Flask(__name__)

# Подключение к локальной MongoDB
app.config["MONGO_URI"] = os.getenv("MONGO_URI", "mongodb://localhost:27017/testdb")
mongo = PyMongo(app)


@app.route("/")
def home():
    return jsonify({"message": "Flask + MongoDB works!"})


@app.route("/insert")
def insert_data():
    """Тестовая вставка данных в коллекцию 'users'"""
    users = mongo.db.users
    user_id = users.insert_one({"name": "Test user", "age": 25}).inserted_id
    return jsonify({"message": "User was added", "id": str(user_id)})


@app.route("/get_users")
def get_users():
    """Получение всех пользователей из коллекции 'users'"""
    users = mongo.db.users.find()
    result = [{"id": str(user["_id"]), "name": user["name"], "age": user["age"]} for user in users]
    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
