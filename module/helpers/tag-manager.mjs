export class TagManager {
  static getAvailableTags() {
    return game.items.filter((item) => item.type === 'tag');
  }

  static async createTag(data) {
    const tagData = {
      name: data.name,
      type: 'tag',
      system: {
        maxRank: data.maxRank || 1,
        description: data.description || '',
        effects: data.effects || [],
      },
    };
    return await Item.create(tagData);
  }
}
