FROM mongo:5.0-focal
RUN echo "rs.initiate();" > /docker-entrypoint-initdb.d/replica-init.js
CMD ["--replSet", "rs0"]
HEALTHCHECK --interval=10s --timeout=30s --start-period=10s --retries=3 \
    CMD test $$(echo "rs.initiate().ok || rs.status().ok" | mongo --quiet) -eq 1
EXPOSE 27017
