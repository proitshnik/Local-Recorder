#!/bin/bash

run_integration_test() {
    echo "---"
    echo "Запускаем интеграционный тест"
    echo "---"
    python3 integration_test.py
}

run_functional_test() {
    echo "---"
    echo "Запускаем функциональный тест"
    echo "---"
    pytest
}

echo "---"
echo "Запускаем тестирование"

if [ $# -eq 0 ]; then
    run_integration_test
    run_functional_test
else
    case "$1" in
        integration)
            run_integration_test
            ;;
        functional)
            run_functional_test
            ;;
        *)
            echo "Неизвестный аргумент: $1"
            echo "Правильный запуск: sh $0 [ |integration|functional]"
            ;;
    esac
fi