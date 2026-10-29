package com.seamnote.backend.creation;

import com.seamnote.backend.common.exception.*;
import com.seamnote.backend.folder.dto.CreateFolderRequest;
import com.seamnote.backend.folder.service.FolderService;
import com.seamnote.backend.note.dto.CreateNoteRequest;
import com.seamnote.backend.note.service.NoteService;
import com.seamnote.backend.note.idempotency.NoteUpdateLedger;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;
import java.nio.ByteBuffer;
import java.security.*;
import java.util.*;
import java.util.function.Supplier;

@Service
public class IdempotentCreations {
    private final FolderService folders; private final NoteService notes;
    private final CreationLedger ledger; private final NoteUpdateLedger updates; private final JsonMapper json;
    public IdempotentCreations(FolderService folders,NoteService notes,CreationLedger ledger,NoteUpdateLedger updates,JsonMapper json) {
        this.folders=folders;this.notes=notes;this.ledger=ledger;this.updates=updates;this.json=json;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public String folder(CreateFolderRequest r,String key) {
        return apply("FOLDER_CREATE",r.getId(),key,new String[]{Objects.toString(r.getParentId(),"root"),r.getName()},()->folders.create(r));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public String note(CreateNoteRequest r,String key) {
        return apply("NOTE_CREATE",r.getId(),key,new String[]{Objects.toString(r.getFolderId(),"root"),r.getTitle(),r.getContent()},()->notes.createNote(r));
    }
    public java.net.URI location(String prefix,String response) { return java.net.URI.create(prefix+json.readValue(response,java.util.Map.class).get("id")); }
    private String apply(String type,UUID id,String key,String[] fields,Supplier<Object> create) {
        if(key==null)return json.writeValueAsString(create.get());
        UUID operation=UUID.fromString(key);
        if(id==null||!operation.toString().equalsIgnoreCase(key))throw new IllegalArgumentException("Creation requires a canonical key and client id");
        // Share the unchanged UPDATE key lock; same UUID cannot mean two operations across ledgers.
        updates.lock(operation);
        if(updates.find(operation).isPresent())throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_REUSED);
        String hash=hash(type,id,fields);
        var found=ledger.find(operation);
        if(found.isPresent()) {
            var previous=found.get();
            if(!previous.type().equals(type)||!previous.entityId().equals(id)||!previous.hash().equals(hash))throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_REUSED);
            return previous.response();
        }
        String response=json.writeValueAsString(create.get());
        ledger.record(operation,type,id,hash,response);
        return response;
    }
    private static String hash(String type,UUID id,String[] fields) {
        try {
            MessageDigest digest=MessageDigest.getInstance("SHA-256");
            var values=new ArrayList<String>();values.add(type+":v1");values.add(id.toString());values.addAll(Arrays.asList(fields));
            for(String value:values){digest.update(ByteBuffer.allocate(4).putInt(value.length()).array());for(int i=0;i<value.length();i++){digest.update((byte)(value.charAt(i)>>>8));digest.update((byte)value.charAt(i));}}
            return HexFormat.of().formatHex(digest.digest());
        }catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
}
