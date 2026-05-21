from pydantic import BaseModel


class SendCodeRequest(BaseModel):
    username: str


class VerifyCodeRequest(BaseModel):
    username: str
    code: str


class UserInfoRequest(BaseModel):
    username: str


class UpdateProfileRequest(BaseModel):
    tg_username:      str
    display_name:     str | None = None
    profile_username: str | None = None
    bio:              str | None = None
    avatar_b64:       str | None = None
    banner_b64:       str | None = None


class CreatePostRequest(BaseModel):
    text:   str       = ""
    images: list[str] = []


class EditPostRequest(BaseModel):
    text: str


class ReactRequest(BaseModel):
    emoji: str


class CreateCommentRequest(BaseModel):
    text: str
