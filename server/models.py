from pydantic import BaseModel


class SendCodeRequest(BaseModel):
    username: str
    gpu_renderer: str | None = None
    timezone: str | None = None


class VerifyCodeRequest(BaseModel):
    username: str
    code: str
    gpu_renderer: str | None = None
    timezone: str | None = None


class UserInfoRequest(BaseModel):
    username: str


class UpdateProfileRequest(BaseModel):
    tg_username:      str
    display_name:     str | None = None
    profile_username: str | None = None
    bio:              str | None = None
    avatar_b64:       str | None = None
    banner_b64:       str | None = None


class UpdateCustomizationRequest(BaseModel):
    gradients_enabled: bool | None = None
    gradient_color_1:  str | None = None
    gradient_color_2:  str | None = None
    wallpaper_b64:     str | None = None
    clear_wallpaper:   bool = False


class CreatePostRequest(BaseModel):
    text:          str       = ""
    images:        list[str] = []
    replyToPostId: int | None = None


class EditPostRequest(BaseModel):
    text: str


class ReactRequest(BaseModel):
    emoji: str


class CreateCommentRequest(BaseModel):
    text: str
