#!/bin/bash

run_integration_test() {
    echo "---"
    echo "Запускаем интеграционный тест"
    echo "---"
    python3 integration_test.py
}

echo "---"
echo "Запускаем тестирование"

if [ $# -eq 0 ]; then
    run_integration_test
else
    case "$1" in
        integration)
            run_integration_test
            ;;
        *)
            echo "Неизвестный аргумент: $1"
            echo "Правильный запуск: sh $0 [ |integration]"
            ;;
    esac
fi