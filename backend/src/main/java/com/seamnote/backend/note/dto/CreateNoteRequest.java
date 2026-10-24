package com.seamnote.backend.note.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class CreateNoteRequest {

    @NotBlank(message = "제목을 입력해주세요.")
    @Size(max=200, message="제목은 200자 이하여야 합니다.")
    private String title;

    @NotNull(message="본문은 null일 수 없습니다.")
    private String content;

    public CreateNoteRequest() {
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
