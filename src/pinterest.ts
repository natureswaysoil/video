import axios from 'axios';

export async function postToPinterest(videoUrl: string, caption: string, accessToken: string, boardId: string) {
  await axios.post(
    `https://api.pinterest.com/v5/pins`,
    {
      board_id: boardId,
      media_source: { source_type: "video_url", url: videoUrl },
      title: caption,
      description: caption,
    },
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
}