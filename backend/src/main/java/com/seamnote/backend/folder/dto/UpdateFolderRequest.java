package com.seamnote.backend.folder.dto;

import java.util.UUID;
import jakarta.validation.constraints.*;

public class UpdateFolderRequest {
    @NotBlank @Size(max = 200)
    private String name;
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
}
