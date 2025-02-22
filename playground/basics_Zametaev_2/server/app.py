from flask import Flask
from flask_pymongo import PyMongo

app = Flask(__name__)
app.config["MONGO_URI"] = "mongodb://mongo:27017/myDatabase"
mongo = PyMongo(app)

@app.route("/")
def home():
    # Вставка данных
    mongo.db.users.insert_one({"name": "Алексей", "age": 30})
    # Поиск данных
    user = mongo.db.users.find_one({"name": "Алексей"})
    return f"Привет, {user['name']}! Тебе {user['age']} лет."

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)