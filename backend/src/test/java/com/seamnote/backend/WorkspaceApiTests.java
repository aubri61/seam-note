package com.seamnote.backend;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import javax.sql.DataSource;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.jpa.properties.hibernate.generate_statistics=true"
})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class WorkspaceApiTests {
    static final String SCHEMA = "workspace_api_" + UUID.randomUUID().toString().replace("-", "");
    @DynamicPropertySource
    static void isolatedSchema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }
    @LocalServerPort int port;
    @Autowired DataSource dataSource;
    @Autowired EntityManagerFactory emf;
    final JsonMapper mapper = JsonMapper.builder().build();
    final HttpClient client = HttpClient.newHttpClient();
    JsonNode call(String method, String path, Object body, int status) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api" + path))
            .header("Content-Type", "application/json")
            .method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(status, response.statusCode(), response.body());
        return mapper.readTree(response.body());
    }
    Set<String> ids(String table) throws Exception {
        Set<String> result = new HashSet<>();
        try(var connection = dataSource.getConnection(); var statement = connection.createStatement();
            var rows = statement.executeQuery("select id from " + SCHEMA + "." + table)) {
            while(rows.next()) result.add(rows.getString(1));
        }
        return result;
    }
    @Test @Order(1)
    void emptyWorkspaceReturnsTwoEmptyArrays() throws Exception {
        var result = call("GET", "/workspace/tree", null, 200);
        assertEquals(2, result.size());
        assertTrue(result.get("folders").isArray()); assertEquals(0, result.get("folders").size());
        assertTrue(result.get("notes").isArray()); assertEquals(0, result.get("notes").size());
    }
    @Test @Order(2)
    void snapshotIncludesAllMetadataWithTwoQueriesAndNoContent() throws Exception {
        var parent = call("POST", "/folders", Map.of("name", "parent"), 201);
        String parentId = parent.get("id").asString();
        var child = call("POST", "/folders", Map.of("name", "child", "parentId", parentId), 201);
        String childId = child.get("id").asString();
        for(String folder : List.of(parentId, childId))
            call("POST", "/notes", Map.of("folderId", folder, "title", "", "content", "must not be selected"), 201);
        var stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.clear();
        var result = call("GET", "/workspace/tree", null, 200);
        assertEquals(2, stats.getPrepareStatementCount(), "Projection endpoint must execute exactly two SQL statements");
        Set<String> folderIds = new HashSet<>(), noteIds = new HashSet<>();
        for(var folder : result.get("folders")) {
            folderIds.add(folder.get("id").asString());
            assertFalse(folder.has("content"));
            assertTrue(folder.has("parentId") && folder.has("version") && folder.has("sortOrder"));
            if(folder.get("id").asString().equals(childId)) assertEquals(parentId, folder.get("parentId").asString());
        }
        for(var note : result.get("notes")) {
            noteIds.add(note.get("id").asString());
            assertEquals(Set.of("id","folderId","title","sortOrder","version","updatedAt"), note.propertyNames());
            assertFalse(note.has("content"));
            assertTrue(folderIds.contains(note.get("folderId").asString()));
        }
        assertEquals(ids("folders"), folderIds); assertEquals(ids("notes"), noteIds);
        assertEquals(2, folderIds.size()); assertEquals(2, noteIds.size());
    }
}
