package com.seamnote.backend.workspace.controller;

import com.seamnote.backend.workspace.dto.WorkspaceTreeResponse;
import com.seamnote.backend.workspace.service.WorkspaceService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/workspace")
public class WorkspaceController {
    private final WorkspaceService workspace;
    public WorkspaceController(WorkspaceService workspace) { this.workspace = workspace; }
    @GetMapping("/tree")
    public WorkspaceTreeResponse tree() { return workspace.getTree(); }
}
