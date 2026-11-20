# Орбита для Android

Орбита собирает расписание РТУ МИРЭА, задачи, заметки и карты кампусов в одном приложении. Есть сравнение расписаний, виджеты Android, напоминания, оформление и синхронизация с календарём.

## Сборка

Для сборки нужны JDK 17, Gradle 8.10.2 и Android SDK Platform 35. Укажи путь к Android SDK через ANDROID_HOME или local.properties.

    gradle assembleDebug

APK появится в build/outputs/apk/debug. Для подписи релизной сборки задай ANDROID_HOME, ANDROID_BUILD_TOOLS и ORBITA_KEYSTORE, затем запусти bash build.sh. Хранилище подписи должно содержать alias orbita.

Приложение поддерживает Android 8.0 и новее. Текущая версия — 1.70.
