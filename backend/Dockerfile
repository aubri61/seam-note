# Build on a workstation/CI matching EC2 architecture; do not build on a 2 GiB host.
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /source
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN chmod +x gradlew
COPY src ./src
RUN ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre-jammy
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 seam && useradd --uid 10001 --gid seam --no-create-home seam
WORKDIR /app
COPY --from=build --chown=10001:10001 /source/build/libs/*.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
