package com.seamnote.backend.creation;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

@Repository
public class CreationLedger {
    private final JdbcTemplate jdbc;
    public CreationLedger(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Success(String type, UUID entityId, String hash, String response) {}
    public Optional<Success> find(UUID key) {
        return jdbc.query("select operation_type,entity_id,request_hash,response_json from creation_operations where operation_id=?",
            (rs,n)->new Success(rs.getString(1),rs.getObject(2,UUID.class),rs.getString(3),rs.getString(4)),key).stream().findFirst();
    }
    public void record(UUID key,String type,UUID id,String hash,String response) {
        jdbc.update("insert into creation_operations(operation_id,operation_type,entity_id,request_hash,response_json) values (?,?,?,?,?)",key,type,id,hash,response);
    }
}
